#!/bin/bash

API_URL="https://evolution-solver-production-pfm22omnda-uc.a.run.app"

echo "Testing Evolution Solver in Production"
echo "======================================"
echo ""

# Test 1: Health check
echo "1. Health Check:"
curl -s "${API_URL}/health" | jq .
echo ""

# Test 2: Submit a small evolution job
echo "2. Submitting Evolution Job:"
JOB_RESPONSE=$(curl -s -X POST "${API_URL}/api/evolution/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "problemContext": "Improve efficiency in last-mile delivery for e-commerce",
    "preferences": {
      "max_capex": 0.5,
      "target_return": 5,
      "timeline_months": 12
    },
    "generations": 1
  }')

echo "$JOB_RESPONSE" | jq .
JOB_ID=$(echo "$JOB_RESPONSE" | jq -r '.jobId')
echo ""

if [ "$JOB_ID" != "null" ]; then
  echo "3. Checking Job Status (Job ID: $JOB_ID):"
  sleep 2
  curl -s "${API_URL}/api/evolution/jobs/${JOB_ID}" | jq .
  echo ""
  
  echo "4. Getting Job Analytics:"
  curl -s "${API_URL}/api/evolution/jobs/${JOB_ID}/analytics" | jq .
else
  echo "Failed to create job"
fi