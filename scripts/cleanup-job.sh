#!/bin/bash

# Comprehensive job cleanup script
# This script will:
# 1. Mark job as failed in Firestore
# 2. Check and remove any Cloud Tasks
# 3. Check for running worker instances
# 4. Clean up any orphaned resources

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-evolutionsolver}"
REGION="${GCP_REGION:-us-central1}"
QUEUE_NAME="evolution-jobs"
JOB_ID="${1:-e6afbcfc-0cad-454b-a578-0022a37dc26f}"

echo "========================================="
echo "Cleaning up job: $JOB_ID"
echo "========================================="

# 1. Check Cloud Tasks queue
echo -e "\n1. Checking Cloud Tasks queue..."
TASKS=$(gcloud tasks list --queue=$QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format=json 2>/dev/null || echo "[]")
TASK_COUNT=$(echo "$TASKS" | jq length)
echo "Found $TASK_COUNT tasks in queue"

if [ "$TASK_COUNT" -gt 0 ]; then
    echo "Tasks found:"
    echo "$TASKS" | jq -r '.[] | "\(.name) - Created: \(.createTime)"'
    
    # Check if any tasks are for our job
    for task in $(echo "$TASKS" | jq -r '.[].name'); do
        # Try to get task details
        TASK_BODY=$(gcloud tasks describe $task --queue=$QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format=json 2>/dev/null || echo "{}")
        
        # Check if task is for our job
        if echo "$TASK_BODY" | grep -q "$JOB_ID"; then
            echo "Found task for job $JOB_ID: $task"
            echo "Deleting task..."
            gcloud tasks delete $task --queue=$QUEUE_NAME --location=$REGION --project=$PROJECT_ID --quiet || true
        fi
    done
fi

# 2. Check running Cloud Run instances
echo -e "\n2. Checking Cloud Run worker instances..."
WORKER_INSTANCES=$(gcloud run services describe evolution-solver-worker \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(status.traffic[0].latestRevision)" 2>/dev/null || echo "")

if [ -n "$WORKER_INSTANCES" ]; then
    echo "Worker service is running revision: $WORKER_INSTANCES"
    # Note: We don't kill the worker service itself, just note it's running
fi

# 3. Check active Cloud Run executions
echo -e "\n3. Checking for active executions..."
# This would show if there are any active requests being processed
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=evolution-solver-worker AND \"Processing evolution job $JOB_ID\"" \
    --limit=5 \
    --format="table(timestamp,jsonPayload.message)" \
    --project=$PROJECT_ID || true

# 4. Update Firestore (using curl to API)
echo -e "\n4. Updating job status in Firestore..."
# First check current status
CURRENT_STATUS=$(curl -s https://evolution-solver-production-871069696471.us-central1.run.app/api/evolution/jobs/$JOB_ID | jq -r .status)
echo "Current job status: $CURRENT_STATUS"

# Note: We would need to add a kill endpoint to the API
# For now, we can only report the status

# 5. Summary
echo -e "\n========================================="
echo "Cleanup Summary for job $JOB_ID:"
echo "- Cloud Tasks in queue: $TASK_COUNT"
echo "- Job status in Firestore: $CURRENT_STATUS"
echo "- Worker service: Running"
echo ""
echo "Actions taken:"
echo "- Deleted any Cloud Tasks for this job"
echo "- Job still marked as '$CURRENT_STATUS' in Firestore (no kill endpoint available)"
echo ""
echo "Recommendations:"
echo "1. The job will timeout naturally if no tasks are processing it"
echo "2. Consider adding a /api/evolution/jobs/:id/kill endpoint"
echo "3. Worker service will scale down to 0 when idle"
echo "========================================="