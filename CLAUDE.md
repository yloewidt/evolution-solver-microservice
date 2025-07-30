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
npm test -- --testNamePattern="pattern"  # Run tests matching pattern
```

### Linting
```bash
npm run lint                # Run ESLint on src/ and test/ directories
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

1. **Workflow-Based Processing**: Uses Cloud Workflows to orchestrate evolution jobs, maintaining state across generations for consistent score progression
2. **Individual Phase Endpoints**: Worker provides separate endpoints for variator, enricher, and ranker phases (processed via `workerHandlersV2.js`)
3. **Result Persistence**: Firestore stores job results and maintains generation history for later retrieval
4. **Separation of Concerns**: API handles requests, workflows orchestrate jobs, workers process individual phases
5. **Cloud-Native Design**: Built for Google Cloud Run with proper health checks, graceful shutdown, and auto-scaling

### Current Architecture Files
- **Active**: `workerHandlersV2.js` - Current implementation with workflow-based processing

## Important Configuration

### Environment Variables
Required environment variables (see `.env.example`):
- `OPENAI_API_KEY`: Required for o3 model access
- `GCP_PROJECT_ID`: Google Cloud project
- `EVOLUTION_WORKER_URL`: Worker service URL for Cloud Tasks
- `FIRESTORE_DATABASE`: Firestore database ID (default: "(default)")
- `FIRESTORE_COLLECTION`: Collection name for results (default: "evolution-results")
- `CLOUD_TASKS_QUEUE`: Queue name for job processing (default: "evolution-jobs")
- `SERVICE_ACCOUNT_EMAIL`: Service account for Cloud Tasks
- `EVOLUTION_GENERATIONS`: Number of evolution generations (default: 10)
- `PORT`: Server port (default: 8080)
- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)

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
2. **Cloud Tasks**: Jobs are enqueued with specific URL patterns handled by `cloud/run/workerHandlersV2.js`
3. **Firestore**: Results are stored in the collection specified by `FIRESTORE_COLLECTION` env var
4. **Cloud Workflows**: Optional integration for orchestrating complex evolution pipelines

## Testing Approach

- Unit tests focus on individual service and utility functions
- Integration tests verify API endpoints and service interactions
- E2E tests validate full job processing flow
- Use `npm test -- --testNamePattern="pattern"` to run specific tests
- Tests use mock implementations from `test/mocks/` for external dependencies
- Test timeout is configured to 30 seconds per test

## API Endpoints

- `POST /api/evolution/jobs` - Submit a new evolution job
- `GET /api/evolution/jobs/:jobId` - Get job status
- `GET /api/evolution/results/:jobId` - Get job results
- `GET /api/evolution/jobs` - List all jobs (with optional filters)
- `GET /health` - Health check endpoint
- `GET /ready` - Readiness check endpoint

## Development Workflow

1. **Local Setup**:
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   ```

2. **Running Locally**:
   - Start API: `npm start`
   - Start Worker: `npm run worker` (in separate terminal)
   - Both services needed for full functionality

3. **Making Changes**:
   - Core algorithm changes: `src/core/evolutionarySolver.js`
   - API changes: `src/api/routes.js`
   - Worker logic: `cloud/run/workerHandlersV2.js`
   - Always run tests after changes: `npm test`

4. **Adding New Features**:
   - Follow existing patterns in services layer
   - Add unit tests in `test/unit/`
   - Add integration tests if touching API or worker
   - Update environment variables in `.env.example` if needed