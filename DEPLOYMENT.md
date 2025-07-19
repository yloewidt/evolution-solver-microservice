# Evolution Solver Microservice Deployment Guide

## Prerequisites

- Google Cloud Platform account with billing enabled
- `gcloud` CLI installed and configured
- Docker installed (for local testing)
- Node.js 18+ installed

## Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Set up environment:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Run locally:**
```bash
npm start
```

4. **Run with Docker:**
```bash
docker build -t evolution-solver .
docker run -p 8080:8080 --env-file .env evolution-solver
```

## Google Cloud Setup

### 1. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create evolution-solver-sa \
  --display-name="Evolution Solver Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/firestore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### 2. Create Firestore Database

```bash
# Create Firestore database (if not exists)
gcloud firestore databases create \
  --location=us-central1 \
  --type=firestore-native
```

### 3. Create Cloud Tasks Queue

```bash
# Create queue
gcloud tasks queues create evolution-jobs \
  --location=us-central1 \
  --max-concurrent-dispatches=10 \
  --max-dispatches-per-second=5
```

### 4. Store Secrets

```bash
# Create secret for OpenAI API key
echo -n "your-openai-api-key" | gcloud secrets create openai-api-key \
  --data-file=- \
  --replication-policy="automatic"

# Grant access to service account
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Deployment

### Deploy to Cloud Run

```bash
# Set project
export PROJECT_ID=your-project-id
export REGION=us-central1

# Build and push image
docker build -t gcr.io/$PROJECT_ID/evolution-solver:latest .
docker push gcr.io/$PROJECT_ID/evolution-solver:latest

# Deploy API service
gcloud run deploy evolution-solver-api \
  --image gcr.io/$PROJECT_ID/evolution-solver:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 10 \
  --min-instances 0 \
  --port 8080 \
  --set-env-vars "ENVIRONMENT=production" \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest" \
  --service-account "evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com"

# Deploy worker service
gcloud run deploy evolution-solver-worker \
  --image gcr.io/$PROJECT_ID/evolution-solver:latest \
  --platform managed \
  --region $REGION \
  --no-allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --max-instances 50 \
  --min-instances 0 \
  --port 8080 \
  --command "node" \
  --args "cloud/run/worker.js" \
  --set-env-vars "ENVIRONMENT=production" \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest" \
  --service-account "evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com"
```

### Update Cloud Tasks to use Worker URL

```bash
# Get worker URL
WORKER_URL=$(gcloud run services describe evolution-solver-worker \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

# Update API service with worker URL
gcloud run services update evolution-solver-api \
  --update-env-vars "EVOLUTION_WORKER_URL=$WORKER_URL" \
  --region $REGION
```

## Integration with Main Application

### 1. Install Client Library

Copy the `client/evolutionClient.js` to your main application or install as npm package.

### 2. Configure Environment

Add to your main application's `.env`:
```
USE_EVOLUTION_MICROSERVICE=true
EVOLUTION_SERVICE_URL=https://evolution-solver-api-xxxx.run.app
EVOLUTION_API_KEY=your-api-key  # Optional if using authentication
```

### 3. Update Code

Replace direct evolution solver usage with microservice integration:

```javascript
import { createEvolutionIntegration } from './evolution/evolutionMicroserviceIntegration.js';

const evolutionIntegration = createEvolutionIntegration();

// Submit job
const jobId = await evolutionIntegration.addEvolutionJob(null, {
  problemContext: 'Your problem',
  evolutionConfig: { generations: 10 },
  userId: 'user-id',
  sessionId: 'session-id'
});

// Check status
const status = await evolutionIntegration.getJobStatus(jobId);

// Get results
const results = await evolutionIntegration.getEvolutionResults(jobId);
```

## Monitoring

### View Logs

```bash
# API logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=evolution-solver-api" --limit 50

# Worker logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=evolution-solver-worker" --limit 50
```

### Metrics

```bash
# View metrics in Cloud Console
open https://console.cloud.google.com/run/detail/$REGION/evolution-solver-api/metrics
```

## Maintenance

### Update Service

```bash
# Build new version
docker build -t gcr.io/$PROJECT_ID/evolution-solver:v2 .
docker push gcr.io/$PROJECT_ID/evolution-solver:v2

# Deploy new version
gcloud run deploy evolution-solver-api \
  --image gcr.io/$PROJECT_ID/evolution-solver:v2 \
  --region $REGION
```

### Scale Configuration

```bash
# Adjust scaling
gcloud run services update evolution-solver-api \
  --min-instances 1 \
  --max-instances 100 \
  --region $REGION
```

### Clean Up Old Results

Set up Cloud Scheduler to call cleanup endpoint:
```bash
gcloud scheduler jobs create http cleanup-evolution-results \
  --location $REGION \
  --schedule "0 2 * * *" \
  --uri "$API_URL/cleanup" \
  --http-method POST \
  --oidc-service-account-email "evolution-solver-sa@$PROJECT_ID.iam.gserviceaccount.com"
```

## Troubleshooting

### Common Issues

1. **Authentication errors**: Ensure service account has correct permissions
2. **Timeout errors**: Increase Cloud Run timeout or optimize algorithm
3. **Memory errors**: Increase Cloud Run memory allocation
4. **Rate limiting**: Adjust Cloud Tasks queue configuration

### Debug Commands

```bash
# Test API endpoint
curl https://your-service-url.run.app/health

# Check service status
gcloud run services describe evolution-solver-api --region $REGION

# View recent errors
gcloud logging read "severity>=ERROR" --limit 20
```