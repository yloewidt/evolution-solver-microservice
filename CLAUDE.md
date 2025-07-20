# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Evolution Solver Microservice - A distributed system for running evolutionary algorithms to generate innovative business solutions using OpenAI's o3 model. The service is designed for Google Cloud Run deployment with Cloud Tasks for async processing and Firestore for persistence.

**Repository**: https://github.com/yloewidt/evolution-solver-microservice

## Common Development Commands

```bash
# Local development
npm start              # Run API server on port 8080
npm run worker        # Run worker locally (for testing)

# Testing
npm test              # Run all tests
npm test:coverage     # Run tests with coverage report (80% threshold required)
npm run lint          # Run ESLint

# Docker operations
npm run docker:build  # Build Docker image
npm run docker:run    # Run Docker container locally

# Deployment
./scripts/deploy.sh production        # Deploy to production
./scripts/deploy-api.sh production    # Deploy only API service
./scripts/deploy-worker.sh production # Deploy only worker service

# Cloud Tasks management
PATH="/Users/yonatanloewidt/google-cloud-sdk/bin:$PATH" gcloud tasks list --queue=evolution-jobs --location=us-central1 --project=evolutionsolver
./scripts/configure-queue.sh          # Configure queue retry settings
```

## Key Architecture Concepts

### Service Architecture
The system consists of two Cloud Run services that communicate via Cloud Tasks:
- **API Service** (`evolution-solver-api`): Public-facing REST API that accepts jobs and returns results
- **Worker Service** (`evolution-solver-worker`): Private service that processes evolution jobs asynchronously

### Core Algorithm Flow
The evolutionary algorithm (`src/core/evolutionarySolver.js`) operates in three phases:
1. **Variator**: Generates new solutions (70% offspring from top performers, 30% wildcards)
2. **Enricher**: Analyzes solutions and calculates financial metrics (NPV, CAPEX, likelihood)
3. **Ranker**: Scores solutions using risk-adjusted NPV formula: `(p × NPV_success - (1-p) × CAPEX) / √(CAPEX/C₀)`

### Important Implementation Details
- All monetary values are in millions USD (e.g., 0.05 = $50K)
- Minimum CAPEX is enforced at 0.05 ($50K) for any idea validation
- HTTP/1.1 is forced (not HTTP/2) due to Cloud Run gVisor compatibility issues
- Jobs have a 14-minute timeout to allow graceful handling before Cloud Run's 15-minute limit
- Cloud Tasks retry configuration: max 3 attempts with exponential backoff

## Critical Files and Their Roles

### Entry Points
- `src/server.js` - API server entry point
- `cloud/run/worker.js` - Worker service entry point

### Core Logic
- `src/core/evolutionarySolver.js` - Evolution algorithm implementation
- `src/services/evolutionService.js` - Business logic orchestration
- `src/api/routes.js` - REST API route definitions

### Cloud Integration
- `cloud/firestore/resultStore.js` - Firestore data persistence
- `cloud/tasks/taskHandler.js` - Cloud Tasks queue management
- `src/services/analyticsService.js` - Job analytics and telemetry

### Configuration
- `.env` - Local environment variables (copy from .env.example)
- `scripts/deploy*.sh` - Deployment automation scripts
- `Dockerfile` - Container configuration with non-root user

## Error Handling and Retry Logic

The service distinguishes between retriable and non-retriable errors:
- **4xx responses** (validation errors, missing fields) - Not retried by Cloud Tasks
- **5xx responses** (transient failures, timeouts) - Retried up to 3 times

Idempotency is implemented by checking job status before processing to prevent duplicate work.

## Environment Variables

Critical environment variables:
- `OPENAI_API_KEY` - Required for o3 model access
- `GCP_PROJECT_ID` - Default: evolutionsolver
- `EVOLUTION_WORKER_URL` - Worker service URL (auto-configured in Cloud Run)
- `CLOUD_TASKS_QUEUE` - Queue name (default: evolution-jobs)
- `FIRESTORE_DATABASE` - Database ID (default: (default))

## Testing Considerations

- Unit tests use Jest with ESM support
- Integration tests require mocking of Cloud services
- Coverage threshold is 80% for all metrics
- Server entry points are excluded from coverage

## Cloud Resources

The service uses these GCP resources:
- **Cloud Run**: evolution-solver-api, evolution-solver-worker
- **Cloud Tasks Queue**: evolution-jobs (us-central1)
- **Firestore**: Default database for job storage
- **Secret Manager**: openai-api-key secret
- **Service Account**: evolution-solver-sa@evolutionsolver.iam.gserviceaccount.com

## Important Gotchas

1. **HTTP/2 Issues**: Cloud Run's gVisor has HTTP/2 compatibility problems, so HTTP/1.1 is forced in the OpenAI client configuration
2. **Race Conditions**: Always create Firestore document before Cloud Tasks to avoid "No document to update" errors
3. **Timeout Handling**: Use 14-minute timeout in code to gracefully handle before Cloud Run's 15-minute hard limit
4. **Unit Conversions**: All monetary values must be in millions USD throughout the system
5. **Retry Storms**: Cloud Tasks can create retry storms with expensive o3 calls - queue is configured with strict limits