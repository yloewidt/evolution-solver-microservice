# Google Cloud Setup Instructions

## Prerequisites
You need to have `gcloud` CLI installed and authenticated. Install it from: https://cloud.google.com/sdk/docs/install

## Setup Steps

1. **Authenticate with Google Cloud**:
   ```bash
   gcloud auth login
   gcloud config set project evolutionsolver
   ```

2. **Enable required APIs**:
   ```bash
   gcloud services enable firestore.googleapis.com
   gcloud services enable cloudtasks.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable artifactregistry.googleapis.com
   gcloud services enable secretmanager.googleapis.com
   ```

3. **Create Firestore Database**:
   ```bash
   # Create Firestore in Native mode
   gcloud firestore databases create --location=us-central1
   ```

4. **Create Cloud Tasks Queue**:
   ```bash
   gcloud tasks queues create evolution-jobs \
     --location=us-central1 \
     --max-concurrent-dispatches=10 \
     --max-attempts=3
   ```

5. **Grant IAM Permissions**:
   ```bash
   # Allow service account to act as itself (for Cloud Tasks)
   gcloud iam service-accounts add-iam-policy-binding \
     evolution-solver@evolutionsolver.iam.gserviceaccount.com \
     --member="serviceAccount:evolution-solver@evolutionsolver.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"

   # Grant service account necessary roles
   gcloud projects add-iam-policy-binding evolutionsolver \
     --member="serviceAccount:evolution-solver@evolutionsolver.iam.gserviceaccount.com" \
     --role="roles/datastore.user"

   gcloud projects add-iam-policy-binding evolutionsolver \
     --member="serviceAccount:evolution-solver@evolutionsolver.iam.gserviceaccount.com" \
     --role="roles/cloudtasks.enqueuer"

   gcloud projects add-iam-policy-binding evolutionsolver \
     --member="serviceAccount:evolution-solver@evolutionsolver.iam.gserviceaccount.com" \
     --role="roles/run.invoker"
   ```

6. **Update Cloud Run services to use service account**:
   ```bash
   # Update API service
   gcloud run services update evolution-api \
     --service-account=evolution-solver@evolutionsolver.iam.gserviceaccount.com \
     --region=us-central1

   # Update worker service
   gcloud run services update evolution-worker \
     --service-account=evolution-solver@evolutionsolver.iam.gserviceaccount.com \
     --region=us-central1
   ```

## Testing

After completing the setup, test the service:

```bash
# Test health endpoint
curl https://evolution-api-871069696471.us-central1.run.app/health

# Submit a test job
curl -X POST https://evolution-api-871069696471.us-central1.run.app/api/evolution/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "params": {
      "populationSize": 100,
      "generations": 10,
      "mutationRate": 0.1,
      "crossoverRate": 0.7,
      "selectionMethod": "tournament",
      "problemType": "optimization",
      "fitnessFunctionCode": "return individual.reduce((a, b) => a + b, 0);"
    }
  }'
```

## Common Issues

1. **NOT_FOUND error**: Firestore database doesn't exist. Run step 3.
2. **Permission denied**: Service account missing permissions. Run step 5.
3. **HTTPS required**: Make sure EVOLUTION_WORKER_URL uses https:// in production.