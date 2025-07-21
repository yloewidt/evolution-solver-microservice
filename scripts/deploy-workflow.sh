#!/bin/bash

# Deploy Cloud Workflows for Evolution Solver
# Usage: ./scripts/deploy-workflow.sh [environment]

set -e

# Configuration
ENVIRONMENT=${1:-staging}
PROJECT_ID="evolutionsolver"
LOCATION="us-central1"
WORKFLOW_NAME="evolution-job-workflow"
SERVICE_ACCOUNT="evolution-solver@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying Cloud Workflow${NC}"
echo "Environment: ${ENVIRONMENT}"
echo "Project: ${PROJECT_ID}"
echo "Location: ${LOCATION}"
echo "Workflow: ${WORKFLOW_NAME}-${ENVIRONMENT}"

# Get worker URL
WORKER_URL=$(gcloud run services describe evolution-solver-worker-${ENVIRONMENT} \
    --platform managed \
    --region ${LOCATION} \
    --project ${PROJECT_ID} \
    --format 'value(status.url)' 2>/dev/null || echo "")

if [ -z "$WORKER_URL" ]; then
    echo -e "${RED}Error: Could not get worker service URL${NC}"
    exit 1
fi

echo "Worker URL: ${WORKER_URL}"

# Deploy workflow
echo -e "${YELLOW}Deploying workflow...${NC}"
gcloud workflows deploy ${WORKFLOW_NAME}-${ENVIRONMENT} \
    --source=workflows/evolution-job-v2.yaml \
    --location=${LOCATION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --set-env-vars=WORKER_URL=${WORKER_URL}

# Get workflow details
WORKFLOW_ID=$(gcloud workflows describe ${WORKFLOW_NAME}-${ENVIRONMENT} \
    --location=${LOCATION} \
    --project=${PROJECT_ID} \
    --format='value(name)')

echo -e "${GREEN}Workflow deployed successfully!${NC}"
echo "Workflow ID: ${WORKFLOW_ID}"

# Grant permissions for API service to execute workflow
echo -e "${YELLOW}Granting permissions...${NC}"
gcloud workflows add-iam-policy-binding ${WORKFLOW_NAME}-${ENVIRONMENT} \
    --location=${LOCATION} \
    --project=${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/workflows.invoker"

echo -e "${GREEN}Deployment complete!${NC}"