#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-evolutionsolver}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="evolution-solver"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Parse arguments
ENVIRONMENT="${1:-development}"
TAG="${2:-latest}"

echo -e "${YELLOW}Deploying Evolution Solver Microservice${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Tag: ${TAG}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    echo -e "${RED}Invalid environment: $ENVIRONMENT${NC}"
    echo "Usage: ./deploy.sh [development|staging|production] [tag]"
    exit 1
fi

# Build and tag image
echo -e "${YELLOW}Building Docker image...${NC}"
docker buildx build --platform linux/amd64 -t ${SERVICE_NAME}:${TAG} --load .
docker tag ${SERVICE_NAME}:${TAG} ${IMAGE_NAME}:${TAG}
docker tag ${SERVICE_NAME}:${TAG} ${IMAGE_NAME}:${ENVIRONMENT}

# Push to GCR
echo -e "${YELLOW}Pushing image to Google Container Registry...${NC}"
docker push ${IMAGE_NAME}:${TAG}
docker push ${IMAGE_NAME}:${ENVIRONMENT}

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME}-${ENVIRONMENT} \
    --image ${IMAGE_NAME}:${TAG} \
    --platform managed \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --min-instances 0 \
    --port 8080 \
    --set-env-vars "ENVIRONMENT=${ENVIRONMENT},NODE_ENV=production,USE_WORKFLOWS=true" \
    --set-secrets "OPENAI_API_KEY=openai-api-key:latest" \
    --service-account "${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME}-${ENVIRONMENT} \
    --platform managed \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --format 'value(status.url)')

echo -e "${GREEN}API deployment complete!${NC}"
echo "API URL: ${SERVICE_URL}"

# Deploy worker service
echo -e "${YELLOW}Deploying worker service...${NC}"
./scripts/deploy-worker.sh ${ENVIRONMENT} ${TAG}

echo -e "${GREEN}All deployments complete!${NC}"