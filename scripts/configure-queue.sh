#!/bin/bash

# Configure Cloud Tasks queue with appropriate retry settings for expensive operations

PROJECT_ID=${GCP_PROJECT_ID:-evolutionsolver}
LOCATION=${GCP_LOCATION:-us-central1}
QUEUE_NAME=${CLOUD_TASKS_QUEUE:-evolution-jobs}

echo "Configuring Cloud Tasks queue: $QUEUE_NAME"
echo "Project: $PROJECT_ID"
echo "Location: $LOCATION"

# Update queue configuration
gcloud tasks queues update $QUEUE_NAME \
  --location=$LOCATION \
  --project=$PROJECT_ID \
  --max-attempts=3 \
  --max-retry-duration=600s \
  --min-backoff=10s \
  --max-backoff=300s \
  --max-doublings=3 \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=5

if [ $? -eq 0 ]; then
  echo "✅ Queue configuration updated successfully"
  
  # Display current configuration
  echo ""
  echo "Current queue configuration:"
  gcloud tasks queues describe $QUEUE_NAME \
    --location=$LOCATION \
    --project=$PROJECT_ID \
    --format="yaml(name,rateLimits,retryConfig,state)"
else
  echo "❌ Failed to update queue configuration"
  exit 1
fi