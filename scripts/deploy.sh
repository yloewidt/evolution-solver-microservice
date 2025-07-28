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
  setup         Set up Cloud resources (queues, IAM, etc.)

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

# Deploy API service
deploy_api() {
    log_info "Deploying API service to $ENVIRONMENT..."
    
    local image="gcr.io/${PROJECT_ID}/evolution-solver:${IMAGE_TAG}"
    
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
        --set-env-vars=NODE_ENV=${ENVIRONMENT} \
        --set-env-vars=GCP_PROJECT_ID=${PROJECT_ID} \
        --set-env-vars=FIRESTORE_DATABASE=${FIRESTORE_DATABASE} \
        --set-env-vars=FIRESTORE_COLLECTION=${FIRESTORE_COLLECTION} \
        --set-env-vars=CLOUD_TASKS_QUEUE=${CLOUD_TASKS_QUEUE} \
        --set-env-vars=CLOUD_TASKS_LOCATION=${CLOUD_TASKS_LOCATION} \
        --set-env-vars=SERVICE_ACCOUNT_EMAIL=${SERVICE_ACCOUNT} \
        --set-env-vars=PORT=8080 \
        --set-env-vars=ALLOWED_ORIGINS=${ALLOWED_ORIGINS} \
        --set-env-vars=LOG_LEVEL=${LOG_LEVEL} \
        --set-env-vars=EVOLUTION_GENERATIONS=10 \
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
    else
        eval "$deploy_cmd"
        
        # Get and display the service URL
        local api_url=$(get_service_url "$API_SERVICE_NAME")
        log_info "API deployed successfully to: $api_url"
        
        # Update worker environment with API URL
        export EVOLUTION_WORKER_URL="${api_url}/internal/worker"
    fi
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
            log_error "API service must be deployed first to get worker URL"
            exit 1
        fi
    fi
    
    local image="gcr.io/${PROJECT_ID}/evolution-solver:${IMAGE_TAG}"
    
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
        --set-env-vars=NODE_ENV=${ENVIRONMENT} \
        --set-env-vars=GCP_PROJECT_ID=${PROJECT_ID} \
        --set-env-vars=FIRESTORE_DATABASE=${FIRESTORE_DATABASE} \
        --set-env-vars=FIRESTORE_COLLECTION=${FIRESTORE_COLLECTION} \
        --set-env-vars=PORT=8080 \
        --set-env-vars=LOG_LEVEL=${LOG_LEVEL} \
        --set-env-vars=EVOLUTION_GENERATIONS=10 \
        --update-secrets=OPENAI_API_KEY=openai-api-key:latest \
        --command=node,cloud/run/worker.js \
        --no-allow-unauthenticated"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would execute:"
        echo "$deploy_cmd"
    else
        eval "$deploy_cmd"
        
        # Get and display the service URL
        local worker_url=$(get_service_url "$WORKER_SERVICE_NAME")
        log_info "Worker deployed successfully to: $worker_url"
        
        # Update API with worker URL if needed
        log_info "Updating API service with worker URL..."
        gcloud run services update ${API_SERVICE_NAME} \
            --project=${PROJECT_ID} \
            --region=${REGION} \
            --update-env-vars=EVOLUTION_WORKER_URL=${worker_url}/task
    fi
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
    else
        eval "$deploy_cmd"
        log_info "Workflow deployed successfully"
    fi
}

# Set up Cloud resources
setup_resources() {
    log_info "Setting up Cloud resources for $ENVIRONMENT..."
    
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
    
    # Set up IAM bindings
    log_info "Setting up IAM bindings..."
    
    # Cloud Run invoker for Cloud Tasks
    gcloud run services add-iam-policy-binding ${WORKER_SERVICE_NAME} \
        --project=${PROJECT_ID} \
        --region=${REGION} \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/run.invoker" || true
    
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
    
    log_info "Starting deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "Action: $ACTION"
    log_info "Image Tag: $IMAGE_TAG"
    
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