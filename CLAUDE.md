# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
```bash
# Development
npm run dev                  # Start in development mode with nodemon
npm start                    # Start production server

# Testing
npm test                     # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Generate coverage report (requires 80% coverage)

# Code Quality
npm run lint                # Run ESLint

# Docker Development
npm run docker:build        # Build Docker image
npm run docker:run          # Run Docker container locally
docker-compose up           # Run full stack (API + Worker)

# Deployment
npm run deploy              # Deploy to Google Cloud Run
./scripts/deploy.sh staging # Deploy to specific environment
```

### Testing Specific Files
```bash
# Run specific test file
npm test -- test/api.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create a new job"
```

## Architecture Overview

This is a cloud-native microservice implementing an evolutionary problem solver using OpenAI's language models. The system uses an asynchronous job processing pattern with REST API and background workers.

### Key Architectural Components

1. **API Layer** (`src/api/routes.js`)
   - REST endpoints for job submission and management
   - Delegates to service layer for business logic
   - Returns job IDs for async processing

2. **Service Layer** (`src/services/evolutionService.js`)
   - Orchestrates the evolutionary solving process
   - Manages job lifecycle and state transitions
   - Integrates with Cloud Tasks for async execution

3. **Core Algorithm** (`src/core/evolutionarySolver.js`)
   - Implements the 4-phase evolutionary algorithm:
     - Variation: Generate diverse solutions using o3 model
     - Enrichment: Enhance solutions with additional context
     - Ranking: Score and rank solutions
     - Refinement: Improve top solutions
   - Uses OpenAI's o3 model with fallback to GPT-4o for JSON formatting

4. **Data Persistence** (`src/services/resultStore.js`)
   - Firestore abstraction for job storage
   - Implements repository pattern
   - Handles CRUD operations and queries

5. **Async Processing** (`cloud/tasks/taskHandler.js`)
   - Cloud Tasks integration for job queuing
   - Manages worker communication
   - Handles retries and error scenarios

6. **Worker Service** (`cloud/run/worker.js`)
   - Separate Cloud Run instance for processing
   - Pulls jobs from queue and executes algorithm
   - Updates job status in Firestore

### Data Flow
1. Client submits job via REST API → Job ID returned
2. API creates Cloud Task → Job queued
3. Worker picks up task → Executes evolutionary algorithm
4. Results stored in Firestore → Client polls for results

### Key Design Patterns
- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic encapsulation
- **Async Job Processing**: Cloud Tasks for scalability
- **Dependency Injection**: Services injected into routes

## Important Considerations

### Environment Configuration
The project uses environment variables for configuration. Always check `.env.example` for required variables:
- `OPENAI_API_KEY`: Required for AI model access
- `GOOGLE_CLOUD_PROJECT`: GCP project ID
- `CLOUD_TASKS_QUEUE`: Queue name for async processing
- `WORKER_URL`: Cloud Run worker endpoint

### Testing Approach
- Unit tests mock external dependencies (OpenAI, Firestore, Cloud Tasks)
- Integration tests use in-memory implementations
- Test coverage requirement: 80% minimum
- Always run tests before deploying

### API Response Format
All API responses follow this structure:
```json
{
  "success": true/false,
  "data": { ... },
  "error": "Error message if applicable"
}
```

### Job Status Values
Jobs progress through these states:
- `pending`: Initial state after submission
- `processing`: Worker has started execution
- `completed`: Successfully finished
- `failed`: Error occurred during processing

### Cloud Deployment
The service is designed for Google Cloud Run:
- Containerized with Docker
- Auto-scaling enabled
- Uses Cloud Tasks for async processing
- Firestore for data persistence
- Secret Manager for sensitive configuration