#!/bin/bash
# Config loader library for deployment scripts
# Loads YAML configuration files and exports variables

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/../../config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if yq is installed
check_dependencies() {
    if ! command -v yq &> /dev/null; then
        log_error "yq is required but not installed. Install with: brew install yq (macOS) or snap install yq (Linux)"
        exit 1
    fi
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is required but not installed"
        exit 1
    fi
}

# Load environment configuration
load_config() {
    local environment="${1:-development}"
    local config_file="${CONFIG_DIR}/environments.yaml"
    
    if [[ ! -f "$config_file" ]]; then
        log_error "Configuration file not found: $config_file"
        exit 1
    fi
    
    log_info "Loading configuration for environment: $environment"
    
    # Load defaults
    export PROJECT_ID=$(yq eval '.defaults.project_id' "$config_file")
    export REGION=$(yq eval '.defaults.region' "$config_file")
    export SERVICE_ACCOUNT=$(yq eval '.defaults.service_account' "$config_file")
    export CLOUD_TASKS_QUEUE=$(yq eval '.defaults.cloud_tasks_queue' "$config_file")
    export CLOUD_TASKS_LOCATION=$(yq eval '.defaults.cloud_tasks_location' "$config_file")
    export FIRESTORE_DATABASE=$(yq eval '.defaults.firestore_database' "$config_file")
    export FIRESTORE_COLLECTION=$(yq eval '.defaults.firestore_collection' "$config_file")
    
    # Load environment-specific config
    local env_prefix=".environments.${environment}"
    
    # API configuration
    export API_SERVICE_NAME=$(yq eval "${env_prefix}.api.service_name" "$config_file")
    export API_MEMORY=$(yq eval "${env_prefix}.api.memory" "$config_file")
    export API_CPU=$(yq eval "${env_prefix}.api.cpu" "$config_file")
    export API_MIN_INSTANCES=$(yq eval "${env_prefix}.api.min_instances" "$config_file")
    export API_MAX_INSTANCES=$(yq eval "${env_prefix}.api.max_instances" "$config_file")
    export API_TIMEOUT=$(yq eval "${env_prefix}.api.timeout" "$config_file")
    export API_CONCURRENCY=$(yq eval "${env_prefix}.api.concurrency" "$config_file")
    
    # Worker configuration
    export WORKER_SERVICE_NAME=$(yq eval "${env_prefix}.worker.service_name" "$config_file")
    export WORKER_MEMORY=$(yq eval "${env_prefix}.worker.memory" "$config_file")
    export WORKER_CPU=$(yq eval "${env_prefix}.worker.cpu" "$config_file")
    export WORKER_MIN_INSTANCES=$(yq eval "${env_prefix}.worker.min_instances" "$config_file")
    export WORKER_MAX_INSTANCES=$(yq eval "${env_prefix}.worker.max_instances" "$config_file")
    export WORKER_TIMEOUT=$(yq eval "${env_prefix}.worker.timeout" "$config_file")
    export WORKER_CONCURRENCY=$(yq eval "${env_prefix}.worker.concurrency" "$config_file")
    
    # Other environment config
    export ALLOWED_ORIGINS=$(yq eval "${env_prefix}.allowed_origins" "$config_file")
    export LOG_LEVEL=$(yq eval "${env_prefix}.log_level" "$config_file")
    
    # Export environment name
    export ENVIRONMENT="$environment"
    
    # Image tag (can be overridden)
    export IMAGE_TAG="${IMAGE_TAG:-latest}"
    
    log_info "Configuration loaded successfully"
}

# Load resources configuration
load_resources() {
    local resources_file="${CONFIG_DIR}/resources.yaml"
    
    if [[ ! -f "$resources_file" ]]; then
        log_error "Resources file not found: $resources_file"
        exit 1
    fi
    
    # This function can be extended to load specific resource configurations
    # For now, we'll just validate the file exists
    log_info "Resources configuration validated"
}

# Get service URL after deployment
get_service_url() {
    local service_name="$1"
    local project_id="${PROJECT_ID}"
    local region="${REGION}"
    
    gcloud run services describe "$service_name" \
        --project="$project_id" \
        --region="$region" \
        --format='value(status.url)' 2>/dev/null || echo ""
}

# Wait for service to be ready
wait_for_service() {
    local service_name="$1"
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for service $service_name to be ready..."
    
    while [[ $attempt -le $max_attempts ]]; do
        local url=$(get_service_url "$service_name")
        if [[ -n "$url" ]]; then
            if curl -sf "$url/health" > /dev/null 2>&1; then
                log_info "Service $service_name is ready at $url"
                return 0
            fi
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    echo
    log_error "Service $service_name did not become ready in time"
    return 1
}

# Validate environment name
validate_environment() {
    local env="$1"
    local valid_envs=("development" "staging" "production")
    
    for valid_env in "${valid_envs[@]}"; do
        if [[ "$env" == "$valid_env" ]]; then
            return 0
        fi
    done
    
    log_error "Invalid environment: $env. Valid environments are: ${valid_envs[*]}"
    exit 1
}

# Export functions
export -f log_info log_warn log_error
export -f check_dependencies load_config load_resources
export -f get_service_url wait_for_service validate_environment