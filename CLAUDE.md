# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Running the Service
```bash
npm start           # Start API server
npm run worker      # Start worker service
npm run dev         # Start with nodemon for development
```

### Testing
```bash
npm test                    # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage report
npm test -- path/to/test   # Run a specific test file
```

### Deployment
```bash
./scripts/deploy.sh [environment] [tag]  # Deploy to GCP (environment: dev/staging/production)
./scripts/deploy-workflow.sh             # Deploy Cloud Workflows
```

### Docker
```bash
npm run docker:build    # Build Docker image
npm run docker:run      # Run Docker container locally
```

## Architecture Overview

This is a microservice implementing an evolutionary algorithm for generating innovative business solutions using OpenAI's o3 model. The architecture consists of:

1. **API Service** (`src/server.js`): Express REST API that accepts job submissions and serves results
2. **Worker Service** (`cloud/run/worker.js`): Processes evolution jobs asynchronously via Cloud Tasks
3. **Core Algorithm** (`src/core/evolutionarySolver.js`): Implements the evolutionary algorithm logic
4. **Services Layer** (`src/services/`):
   - `evolutionService.js`: Orchestrates the evolution process
   - `singleIdeaEnricher.js`: Enriches individual ideas using LLM
   - `llmClient.js`: Handles OpenAI o3 model interactions

### Key Architectural Decisions

1. **Async Processing**: Jobs are queued in Cloud Tasks and processed by Cloud Run workers to handle long-running evolution processes (can take 10-15 minutes)
2. **Result Persistence**: Firestore stores job results for later retrieval
3. **Separation of Concerns**: API handles requests, workers process jobs, core algorithm is framework-agnostic
4. **Cloud-Native Design**: Built for Google Cloud Run with proper health checks, graceful shutdown, and auto-scaling

## Important Configuration

### Environment Variables
Required environment variables (see `.env.example`):
- `OPENAI_API_KEY`: Required for o3 model access
- `GCP_PROJECT_ID`: Google Cloud project
- `EVOLUTION_WORKER_URL`: Worker service URL for Cloud Tasks
- `FIRESTORE_DATABASE`: Firestore database ID (default: "(default)")

### Test Configuration
- Jest is configured with 80% coverage threshold
- Tests are organized by type: `test/unit/`, `test/integration/`, `test/e2e/`
- Mock implementations are in `test/mocks/`

### Deployment Configuration
- API Service: 1Gi memory, 1 CPU, 0-10 instances
- Worker Service: 2Gi memory, 2 CPU, 0-50 instances  
- Timeout: 15 minutes per request
- Service Account: `evolution-solver-sa@{PROJECT}.iam.gserviceaccount.com`

## Key Integration Points

1. **OpenAI o3 Model**: The service uses the o3 model via OpenAI SDK. Model calls are made in `src/services/llmClient.js`
2. **Cloud Tasks**: Jobs are enqueued with specific URL patterns handled by `cloud/run/workerHandlersSelector.js`
3. **Firestore**: Results are stored in the collection specified by `FIRESTORE_COLLECTION` env var
4. **Cloud Workflows**: Optional integration for orchestrating complex evolution pipelines

## Testing Approach

- Unit tests focus on individual service and utility functions
- Integration tests verify API endpoints and service interactions
- E2E tests validate full job processing flow
- Use `npm test -- --testNamePattern="pattern"` to run specific tests