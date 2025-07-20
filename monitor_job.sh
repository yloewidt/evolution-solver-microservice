#\!/bin/bash
JOB_ID="e96c5218-9825-4e3c-a7db-c78334acdae8"
TOKEN=$(/Users/yonatanloewidt/google-cloud-sdk/bin/gcloud auth print-identity-token)

while true; do
  clear
  echo "Monitoring He-3 Evolution Job: $JOB_ID"
  echo "Time: $(date)"
  echo "=========================================="
  
  STATUS=$(curl -s -X GET "https://evolution-solver-api-871069696471.us-central1.run.app/api/evolution/jobs/$JOB_ID" \
    -H "Authorization: Bearer $TOKEN")
  
  # Extract key fields using python
  echo "$STATUS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f\"Status: {data.get('status', 'unknown')}\")\
print(f\"Created: {data.get('createdAt', 'unknown')}\")\
if data.get('progress'):
    p = data['progress']
    print(f\"\\nProgress: Generation {p['currentGeneration']}/{p['totalGenerations']} ({p['percentComplete']}%)\")\
    print(f\"Current Phase: {p['phase']}\")\
if data.get('currentGeneration'):\
    print(f\"\\nSaved Generations: {data['currentGeneration']}\")\
if data.get('status') == 'completed':\
    print(f\"\\nCompleted at: {data.get('completedAt', 'unknown')}\")\
    if data.get('totalSolutions'):\
        print(f\"Total solutions generated: {data['totalSolutions']}\")\
    exit(0)"
  
  if [ $? -eq 0 ]; then
    echo "\nJob completed\!"
    break
  fi
  
  sleep 30
done
