#!/bin/bash

# Deploy script for Evolution Solver Worker Service
# Usage: ./scripts/deploy-worker.sh [environment]

set -e

# Add gcloud to PATH
export PATH="/Users/yonatanloewidt/google-cloud-sdk/bin:$PATH"

# Configuration
ENVIRONMENT=${1:-staging}
PROJECT_ID="evolutionsolver"
REGION="us-central1"
SERVICE_NAME="evolution-solver-worker"
IMAGE_NAME="gcr.io/${PROJECT_ID}/evolution-solver"
TAG="${2:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying Evolution Solver Worker Service${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Image: ${IMAGE_NAME}:${TAG}"

# Get the API service URL
API_SERVICE_URL=$(gcloud run services describe evolution-solver-${ENVIRONMENT} \
    --platform managed \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --format 'value(status.url)' 2>/dev/null || echo "")

if [ -z "$API_SERVICE_URL" ]; then
    echo -e "${RED}Warning: Could not get API service URL${NC}"
fi

# Deploy Worker to Cloud Run
echo -e "${YELLOW}Deploying Worker to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME}-${ENVIRONMENT} \
    --image ${IMAGE_NAME}:${TAG} \
    --platform managed \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --no-allow-unauthenticated \
    --memory 4Gi \
    --cpu 2 \
    --timeout 900 \
    --max-instances 100 \
    --min-instances 0 \
    --port 8080 \
    --set-env-vars "ENVIRONMENT=${ENVIRONMENT},NODE_ENV=production,IS_WORKER=true,EVOLUTION_API_URL=${API_SERVICE_URL},GCP_PROJECT_ID=${PROJECT_ID}" \
    --set-secrets "OPENAI_API_KEY=openai-api-key:latest" \
    --service-account "evolution-solver@${PROJECT_ID}.iam.gserviceaccount.com"

# Get worker service URL - use the full URL with project ID
WORKER_URL=$(gcloud run services describe ${SERVICE_NAME}-${ENVIRONMENT} \
    --platform managed \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --format 'value(status.url)' | sed 's/run.app/871069696471.us-central1.run.app/')

echo -e "${GREEN}Worker deployment complete!${NC}"
echo "Worker URL: ${WORKER_URL}"

# Update API service with worker URL
if [ -n "$WORKER_URL" ]; then
    echo -e "${YELLOW}Updating API service with worker URL...${NC}"
    gcloud run services update evolution-solver-${ENVIRONMENT} \
        --update-env-vars "EVOLUTION_WORKER_URL=${WORKER_URL}" \
        --region ${REGION} \
        --project ${PROJECT_ID}
    echo -e "${GREEN}API service updated with worker URL${NC}"
fi

echo -e "${GREEN}Worker deployment complete!${NC}"