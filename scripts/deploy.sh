#!/bin/bash
# Unified deployment script for Evolution Solver microservice
# Usage: ./scripts/deploy [environment] [action] [options]

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source the config loader
source "${SCRIPT_DIR}/lib/config-loader.sh"

# Default values
ENVIRONMENT="${1:-development}"
ACTION="${2:-all}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DRY_RUN="${DRY_RUN:-false}"

# Build and push Docker image
build_and_push_image() {
    log_info "Building Docker image..."
    
    local image_name="gcr.io/${PROJECT_ID}/evolution-solver"
    local full_image="${image_name}:${IMAGE_TAG}"
    
    # Build the image
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute:"
        echo "docker build -t ${full_image} ${PROJECT_ROOT}"
    else
        docker build -t "${full_image}" "${PROJECT_ROOT}"
        
        # Also tag as environment-specific
        docker tag "${full_image}" "${image_name}:${ENVIRONMENT}"
        
        # Configure docker for GCR
        gcloud auth configure-docker --quiet
        
        # Push both tags
        log_info "Pushing image to Google Container Registry..."
        docker push "${full_image}"
        docker push "${image_name}:${ENVIRONMENT}"
        
        log_info "Image pushed successfully: ${full_image}"
    fi
}

# Enable required GCP services
enable_services() {
    log_info "Enabling required GCP services..."
    
    local services=(
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "firestore.googleapis.com"
        "cloudtasks.googleapis.com"
        "secretmanager.googleapis.com"
        "containerregistry.googleapis.com"
    )
    
    for service in "${services[@]}"; do
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN: Would enable ${service}"
        else
            log_info "Enabling ${service}..."
            gcloud services enable ${service} --project=${PROJECT_ID} || true
        fi
    done
}

# Create service account if it doesn't exist
create_service_account() {
    local sa_name="${SERVICE_ACCOUNT%%@*}"  # Extract name from email
    
    log_info "Checking service account ${SERVICE_ACCOUNT}..."
    
    if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT} \
        --project=${PROJECT_ID} &>/dev/null; then
        
        log_info "Creating service account ${sa_name}..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN: Would create service account"
        else
            gcloud iam service-accounts create ${sa_name} \
                --display-name="Evolution Solver Service Account" \
                --project=${PROJECT_ID}
        fi
    else
        log_info "Service account already exists"
    fi
    
    # Grant necessary roles
    local roles=(
        "roles/datastore.user"
        "roles/cloudtasks.enqueuer"
        "roles/cloudtasks.viewer"
        "roles/run.invoker"
        "roles/secretmanager.secretAccessor"
    )
    
    for role in "${roles[@]}"; do
        log_info "Granting ${role} to service account..."
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "DRY RUN: Would grant ${role}"
        else
            gcloud projects add-iam-policy-binding ${PROJECT_ID} \
                --member="serviceAccount:${SERVICE_ACCOUNT}" \
                --role="${role}" \
                --quiet || true
        fi
    done
}

# Check and create secrets
setup_secrets() {
    log_info "Setting up secrets..."
    
    # Check if OpenAI API key secret exists
    if ! gcloud secrets describe openai-api-key \
        --project=${PROJECT_ID} &>/dev/null; then
        
        log_error "Secret 'openai-api-key' does not exist!"
        log_info "Please create it with:"
        log_info "  echo -n 'your-api-key' | gcloud secrets create openai-api-key --data-file=-"
        
        if [[ "$DRY_RUN" != "true" ]]; then
            return 1
        fi
    else
        log_info "Secret 'openai-api-key' exists"
    fi
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [environment] [action] [options]

Environments:
  development    Deploy to development environment (default)
  staging        Deploy to staging environment
  production     Deploy to production environment

Actions:
  all           Deploy all services (default)
  api           Deploy only the API service
  worker        Deploy only the worker service
  workflow      Deploy Cloud Workflows
  setup         Set up Cloud resources (enables APIs, creates service account, queues, IAM, etc.)

Options:
  IMAGE_TAG=tag        Docker image tag to deploy (default: latest)
  DRY_RUN=true        Show what would be deployed without deploying

Examples:
  $0                          # Deploy all services to development
  $0 staging api              # Deploy API to staging
  $0 production all           # Deploy all services to production
  IMAGE_TAG=v1.2.3 $0 production api  # Deploy specific version

EOF
    exit 1
}

# Validate env vars file exists and is readable
validate_deployment() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment variables file does not exist: $env_file"
        return 1
    fi
    
    if [[ ! -r "$env_file" ]]; then
        log_error "Environment variables file is not readable: $env_file"
        return 1
    fi
    
    # Validate YAML syntax
    if ! yq eval '.' "$env_file" > /dev/null 2>&1; then
        log_error "Environment variables file has invalid YAML syntax: $env_file"
        cat "$env_file"
        return 1
    fi
    
    log_info "Deployment validation passed"
    return 0
}

# Deploy API service
deploy_api() {
    log_info "Deploying API service to $ENVIRONMENT..."
    
    local image="gcr.io/${PROJECT_ID}/evolution-solver:${IMAGE_TAG}"
    
    # Create a temporary env vars file in YAML format to handle special characters
    local env_file=$(mktemp --suffix=.yaml)
    cat > "$env_file" <<EOF
NODE_ENV: "${ENVIRONMENT}"
GCP_PROJECT_ID: "${PROJECT_ID}"
FIRESTORE_DATABASE: "${FIRESTORE_DATABASE}"
FIRESTORE_COLLECTION: "${FIRESTORE_COLLECTION}"
CLOUD_TASKS_QUEUE: "${CLOUD_TASKS_QUEUE}"
CLOUD_TASKS_LOCATION: "${CLOUD_TASKS_LOCATION}"
SERVICE_ACCOUNT_EMAIL: "${SERVICE_ACCOUNT}"
ALLOWED_ORIGINS: "${ALLOWED_ORIGINS}"
LOG_LEVEL: "${LOG_LEVEL}"
EVOLUTION_GENERATIONS: "10"
EOF
    
    local deploy_cmd="gcloud run deploy ${API_SERVICE_NAME} \
        --image=${image} \
        --project=${PROJECT_ID} \
        --region=${REGION} \
        --platform=managed \
        --memory=${API_MEMORY} \
        --cpu=${API_CPU} \
        --min-instances=${API_MIN_INSTANCES} \
        --max-instances=${API_MAX_INSTANCES} \
        --timeout=${API_TIMEOUT} \
        --concurrency=${API_CONCURRENCY} \
        --service-account=${SERVICE_ACCOUNT} \
        --env-vars-file=\"${env_file}\" \
        --update-secrets=OPENAI_API_KEY=openai-api-key:latest \
        --command=node,src/server.js"
    
    if [[ "$ENVIRONMENT" == "production" ]]; then
        deploy_cmd="$deploy_cmd --allow-unauthenticated"
    else
        deploy_cmd="$deploy_cmd --allow-unauthenticated"
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute:"
        echo "$deploy_cmd"
        log_info "DRY RUN: Environment variables file content:"
        cat "$env_file"
    else
        # Validate deployment files
        if ! validate_deployment "$env_file"; then
            log_error "Deployment aborted due to validation errors"
            rm -f "$env_file"
            return 1
        fi
        
        # Execute the deployment
        if ! eval "$deploy_cmd"; then
            log_error "Deployment failed"
            rm -f "$env_file"
            return 1
        fi
        
        # Get and display the service URL
        local api_url=$(get_service_url "$API_SERVICE_NAME")
        log_info "API deployed successfully to: $api_url"
        
        # Update worker environment with API URL
        export EVOLUTION_WORKER_URL="${api_url}/internal/worker"
    fi
    
    # Clean up temp file
    rm -f "$env_file"
}

# Deploy Worker service
deploy_worker() {
    log_info "Deploying Worker service to $ENVIRONMENT..."
    
    # Get the worker URL if not already set
    if [[ -z "${EVOLUTION_WORKER_URL:-}" ]]; then
        local api_url=$(get_service_url "$API_SERVICE_NAME")
        if [[ -n "$api_url" ]]; then
            EVOLUTION_WORKER_URL="${api_url}/internal/worker"
        else
            log_error "API service must be deployed first to get worker URL. Run './scripts/deploy.sh ${ENVIRONMENT} api' first."
            exit 1
        fi
    fi
    
    local image="gcr.io/${PROJECT_ID}/evolution-solver:${IMAGE_TAG}"
    
    # Create a temporary env vars file in YAML format to handle special characters
    local env_file=$(mktemp --suffix=.yaml)
    cat > "$env_file" <<EOF
NODE_ENV: "${ENVIRONMENT}"
GCP_PROJECT_ID: "${PROJECT_ID}"
FIRESTORE_DATABASE: "${FIRESTORE_DATABASE}"
FIRESTORE_COLLECTION: "${FIRESTORE_COLLECTION}"
LOG_LEVEL: "${LOG_LEVEL}"
EVOLUTION_GENERATIONS: "10"
EOF
    
    local deploy_cmd="gcloud run deploy ${WORKER_SERVICE_NAME} \
        --image=${image} \
        --project=${PROJECT_ID} \
        --region=${REGION} \
        --platform=managed \
        --memory=${WORKER_MEMORY} \
        --cpu=${WORKER_CPU} \
        --min-instances=${WORKER_MIN_INSTANCES} \
        --max-instances=${WORKER_MAX_INSTANCES} \
        --timeout=${WORKER_TIMEOUT} \
        --concurrency=${WORKER_CONCURRENCY} \
        --service-account=${SERVICE_ACCOUNT} \
        --env-vars-file=\"${env_file}\" \
        --update-secrets=OPENAI_API_KEY=openai-api-key:latest \
        --command=node,cloud/run/worker.js \
        --no-allow-unauthenticated"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute:"
        echo "$deploy_cmd"
        log_info "DRY RUN: Environment variables file content:"
        cat "$env_file"
    else
        # Validate deployment files
        if ! validate_deployment "$env_file"; then
            log_error "Deployment aborted due to validation errors"
            rm -f "$env_file"
            return 1
        fi
        
        # Execute the deployment
        if ! eval "$deploy_cmd"; then
            log_error "Deployment failed"
            rm -f "$env_file"
            return 1
        fi
        
        # Get and display the service URL
        local worker_url=$(get_service_url "$WORKER_SERVICE_NAME")
        log_info "Worker deployed successfully to: $worker_url"

        # Grant the service account permission to invoke the worker.
        # We use a retry loop to handle potential API propagation delays.
        log_info "Granting Cloud Run Invoker role to the service account for the worker..."
        
        local attempts=0
        local max_attempts=5
        local success=false
        while [ $attempts -lt $max_attempts ]; do
            if gcloud run services add-iam-policy-binding ${WORKER_SERVICE_NAME} \
                --project=${PROJECT_ID} \
                --region=${REGION} \
                --member="serviceAccount:${SERVICE_ACCOUNT}" \
                --role="roles/run.invoker" \
                --quiet; then
                log_info "Successfully granted IAM role."
                success=true
                break
            fi
            
            attempts=$((attempts+1))
            log_warn "IAM binding failed. Retrying in 5 seconds... (Attempt ${attempts}/${max_attempts})"
            sleep 5
        done

        if [ "$success" = false ]; then
            log_error "Could not grant IAM role to worker service after several attempts. Please grant 'roles/run.invoker' to '${SERVICE_ACCOUNT}' on the '${WORKER_SERVICE_NAME}' service manually."
            exit 1
        fi

        # Update API with worker URL if needed
        log_info "Updating API service with worker URL..."
        gcloud run services update ${API_SERVICE_NAME} \
            --project=${PROJECT_ID} \
            --region=${REGION} \
            --update-env-vars=\"EVOLUTION_WORKER_URL=${worker_url}/task\"
    fi
    
    # Clean up temp file
    rm -f "$env_file"
}

# Deploy Cloud Workflows
deploy_workflow() {
    log_info "Deploying Cloud Workflows..."
    
    local workflow_file="${PROJECT_ROOT}/cloud/workflows/evolution-pipeline.yaml"
    
    if [[ ! -f "$workflow_file" ]]; then
        log_warn "Workflow file not found: $workflow_file"
        return 0
    fi
    
    local deploy_cmd="gcloud workflows deploy evolution-pipeline-${ENVIRONMENT} \
        --source=${workflow_file} \
        --project=${PROJECT_ID} \
        --location=${REGION} \
        --service-account=${SERVICE_ACCOUNT}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute:"
        echo "$deploy_cmd"
        log_info "DRY RUN: Environment variables file content:"
        cat "$env_file"
    else
        eval "$deploy_cmd"
        log_info "Workflow deployed successfully"
    fi
}

# Set up Cloud resources
setup_resources() {
    log_info "Setting up Cloud resources for $ENVIRONMENT..."
    
    # Enable required services first
    enable_services
    
    # Create service account
    create_service_account
    
    # Setup secrets
    setup_secrets || return 1
    
    # Create Cloud Tasks queue if it doesn't exist
    log_info "Setting up Cloud Tasks queue..."
    if ! gcloud tasks queues describe ${CLOUD_TASKS_QUEUE} \
        --project=${PROJECT_ID} \
        --location=${CLOUD_TASKS_LOCATION} &>/dev/null; then
        
        gcloud tasks queues create ${CLOUD_TASKS_QUEUE} \
            --project=${PROJECT_ID} \
            --location=${CLOUD_TASKS_LOCATION} \
            --max-dispatches-per-second=10 \
            --max-concurrent-dispatches=100 \
            --max-attempts=3 \
            --min-backoff=10s \
            --max-backoff=300s
        
        log_info "Cloud Tasks queue created"
    else
        log_info "Cloud Tasks queue already exists"
    fi
    
    # The IAM binding for the worker is now handled within the deploy_worker function.
    # No further IAM actions are needed here for the worker.
    log_info "IAM bindings for the worker will be set upon its successful deployment."
    log_info "Resources setup completed"
}

# Main deployment logic
main() {
    # Check for help
    if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
        usage
    fi
    
    # Validate inputs
    check_dependencies
    validate_environment "$ENVIRONMENT"
    
    # Load configuration
    load_config "$ENVIRONMENT"
    load_resources
    
    # Validate project ID if specified
    if [[ -n "${GCP_PROJECT_ID:-}" ]]; then
        log_info "Using project override: $GCP_PROJECT_ID"
        
        # Verify we're authenticated to the correct project
        local current_project=$(gcloud config get-value project 2>/dev/null || true)
        if [[ "$current_project" != "$PROJECT_ID" ]]; then
            log_warn "Current gcloud project ($current_project) differs from target ($PROJECT_ID)"
            log_info "Setting gcloud project to $PROJECT_ID"
            gcloud config set project "$PROJECT_ID"
        fi
    fi
    
    log_info "Starting deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Project: $PROJECT_ID"
    log_info "Action: $ACTION"
    log_info "Image Tag: $IMAGE_TAG"
    
    # Build and push image first (unless just doing setup)
    if [[ "$ACTION" != "setup" ]]; then
        build_and_push_image
    fi
    
    # Execute action
    case $ACTION in
        api)
            deploy_api
            ;;
        worker)
            deploy_worker
            ;;
        workflow)
            deploy_workflow
            ;;
        setup)
            setup_resources
            ;;
        all)
            deploy_api
            deploy_worker
            deploy_workflow
            ;;
        *)
            log_error "Invalid action: $ACTION"
            usage
            ;;
    esac
    
    log_info "Deployment completed successfully"
}

# Run main function
main "$@"