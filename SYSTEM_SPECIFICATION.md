# Evolution Solver Microservice - System Specification

## 1. Overview

The Evolution Solver Microservice is a cloud-native service that uses evolutionary algorithms powered by OpenAI's o3 model to generate innovative business solutions. It processes problems through multiple generations of idea evolution, enrichment, and ranking to produce high-quality, actionable business strategies.

### Key Features
- Asynchronous job processing with Cloud Tasks
- Multi-generation evolutionary algorithm
- LLM-powered idea generation and enrichment
- Persistent result storage in Firestore
- RESTful API for job management
- Cloud Run deployment with auto-scaling

## 2. System Architecture

### 2.1 Component Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client App    │────▶│   REST API   │────▶│ Cloud Tasks │
└─────────────────┘     └──────────────┘     └─────────────┘
                                │                     │
                                ▼                     ▼
                        ┌──────────────┐     ┌─────────────┐
                        │  Firestore   │◀────│ Cloud Run   │
                        │   Database   │     │   Worker    │
                        └──────────────┘     └─────────────┘
                                                     │
                                             ┌───────────────┐
                                             │  OpenAI API   │
                                             │  (o3 model)   │
                                             └───────────────┘
```

### 2.2 Core Components

1. **API Service** (`src/server.js`)
   - Express.js REST API
   - Handles job submissions and result retrieval
   - Health checks and monitoring endpoints
   - CORS and authentication middleware

2. **Worker Service** (`cloud/run/worker.js`)
   - Processes evolution jobs asynchronously
   - Executes evolutionary algorithm phases
   - Updates job status in Firestore
   - Handles graceful shutdown

3. **Evolutionary Solver** (`src/core/evolutionarySolver.js`)
   - Implements the core evolutionary algorithm
   - Three phases per generation: Variator, Enricher, Ranker
   - Configurable parameters (generations, population size)

4. **Result Store** (`cloud/firestore/resultStore.js`)
   - Firestore integration for persistent storage
   - Stores job metadata, results, and telemetry
   - Supports querying by status, user, or time

## 3. API Specification

### 3.1 Endpoints

#### POST /api/evolution/jobs
Submit a new evolution job.

**Request Body:**
```json
{
  "problemContext": "string (required)",
  "parameters": {
    "generations": 10,
    "populationSize": 5,
    "maxCapex": 50000,
    "targetROI": 10,
    "dealTypes": ["string"]
  },
  "userId": "string (optional)",
  "sessionId": "string (optional)"
}
```

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "message": "Evolution job created successfully"
}
```

#### GET /api/evolution/jobs/:jobId
Get job status and metadata.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "pending|processing|completed|failed",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "generations": {
    "generation_1": {
      "variatorComplete": true,
      "enricherComplete": true,
      "rankerComplete": true,
      "topScore": 8.5,
      "avgScore": 7.2,
      "solutionCount": 5
    }
  },
  "error": "string (if failed)"
}
```

#### GET /api/evolution/results/:jobId
Get complete job results including all solutions.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "completed",
  "topSolutions": [
    {
      "idea_id": "uuid",
      "title": "Solution Title",
      "description": "Detailed description",
      "score": 9.2,
      "implementation_steps": ["step1", "step2"],
      "capex": 45000,
      "projected_roi": 15.5,
      "deal_type": "Partnership"
    }
  ],
  "allSolutions": [],
  "generationHistory": [],
  "metadata": {
    "totalGenerations": 10,
    "totalSolutions": 50,
    "processingTime": 145.5,
    "apiCalls": 30
  }
}
```

#### GET /api/evolution/jobs
List jobs with optional filters.

**Query Parameters:**
- `status`: Filter by job status
- `userId`: Filter by user ID
- `limit`: Maximum results (default: 50)
- `startAfter`: Pagination cursor

**Response:**
```json
{
  "jobs": [
    {
      "jobId": "uuid",
      "status": "completed",
      "createdAt": "ISO 8601",
      "problemContext": "string (truncated)"
    }
  ],
  "hasMore": boolean,
  "nextCursor": "string"
}
```

### 3.2 Worker Endpoints

#### POST /process
Process an evolution job (internal use only).

**Request Body:**
```json
{
  "jobId": "uuid",
  "jobData": {
    "problemContext": "string",
    "evolutionConfig": {},
    "userId": "string"
  }
}
```

## 4. Data Models

### 4.1 Job Document (Firestore)

```typescript
interface Job {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  problemContext: string;
  evolutionConfig: {
    generations: number;
    populationSize: number;
    maxCapex?: number;
    targetROI?: number;
    dealTypes?: string[];
  };
  userId?: string;
  sessionId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
  generations: {
    [key: string]: Generation;
  };
  apiCalls: ApiCall[];
}
```

### 4.2 Generation Structure

```typescript
interface Generation {
  generation: number;
  variatorStarted: boolean;
  variatorComplete: boolean;
  variatorStartedAt?: Timestamp;
  variatorCompletedAt?: Timestamp;
  enricherStarted: boolean;
  enricherComplete: boolean;
  enricherStartedAt?: Timestamp;
  enricherCompletedAt?: Timestamp;
  rankerStarted: boolean;
  rankerComplete: boolean;
  rankerStartedAt?: Timestamp;
  rankerCompletedAt?: Timestamp;
  ideas: Idea[];
  solutions: Solution[];
  topScore: number;
  avgScore: number;
  solutionCount: number;
}
```

### 4.3 Solution Structure

```typescript
interface Solution {
  idea_id: string;
  title: string;
  description: string;
  score: number;
  implementation_steps: string[];
  resource_requirements: {
    capex: number;
    opex: number;
    headcount: number;
    timeline_months: number;
  };
  financial_projections: {
    projected_roi: number;
    payback_period_months: number;
    five_year_npv: number;
  };
  deal_structure: {
    deal_type: string;
    key_terms: string[];
    revenue_share?: number;
  };
  risk_assessment: {
    key_risks: string[];
    mitigation_strategies: string[];
  };
}
```

## 5. Evolutionary Algorithm Workflow

### 5.1 Algorithm Phases

1. **Initialization**
   - Parse problem context
   - Set evolution parameters
   - Create initial population (if provided)

2. **Generation Loop** (repeated N times)
   
   a. **Variator Phase**
   - Generate new ideas based on top performers
   - Apply crossover and mutation strategies
   - Ensure diversity in solution space
   
   b. **Enricher Phase**
   - Enrich each idea with detailed analysis
   - Add implementation steps
   - Calculate financial projections
   - Assess risks and requirements
   
   c. **Ranker Phase**
   - Score all solutions based on criteria
   - Select top performers for next generation
   - Track performance metrics

3. **Finalization**
   - Select top solutions across all generations
   - Generate summary and insights
   - Save complete results

### 5.2 LLM Integration

The system uses OpenAI's o3 model for three types of prompts:

1. **Variator Prompts**: Generate creative variations
2. **Enricher Prompts**: Add detailed analysis
3. **Ranker Prompts**: Evaluate and score solutions

Each prompt is carefully crafted with:
- Clear role definition
- Structured output format
- Specific evaluation criteria
- Examples when needed

## 6. Cloud Infrastructure

### 6.1 Google Cloud Services

1. **Cloud Run**
   - API Service: 1Gi memory, 1 CPU, 0-10 instances
   - Worker Service: 2Gi memory, 2 CPU, 0-50 instances
   - Request timeout: 15 minutes
   - Cold start optimization enabled

2. **Cloud Tasks**
   - Queue: `evolution-jobs`
   - Max dispatches per second: 10
   - Max concurrent dispatches: 50
   - Retry configuration: 3 attempts

3. **Firestore**
   - Database: `(default)` or configurable
   - Collections:
     - `evolution-results`: Main job documents
     - `evolution-results/{jobId}/apiDebug`: API call logs

4. **Cloud Build**
   - Automated CI/CD pipeline
   - Docker image building
   - Multi-environment deployment

### 6.2 Security

1. **Authentication**
   - Service account: `evolution-solver-sa@PROJECT.iam.gserviceaccount.com`
   - OIDC tokens for Cloud Tasks
   - API key for OpenAI

2. **Network Security**
   - HTTPS only
   - CORS configuration
   - Private worker endpoints

## 7. Configuration

### 7.1 Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=your-api-key

# Google Cloud Configuration
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
FIRESTORE_DATABASE=(default)
FIRESTORE_COLLECTION=evolution-results

# Cloud Tasks Configuration
CLOUD_TASKS_QUEUE=evolution-jobs
EVOLUTION_WORKER_URL=https://worker-url.run.app
SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com

# Evolution Configuration
EVOLUTION_GENERATIONS=10
EVOLUTION_POPULATION_SIZE=5

# Server Configuration
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://app.example.com
```

### 7.2 Evolution Parameters

```javascript
{
  generations: 10,          // Number of evolution cycles
  populationSize: 5,        // Ideas per generation
  maxCapex: 100000000,      // Maximum capital expenditure
  targetROI: 10,            // Target return on investment
  dealTypes: [              // Allowed deal structures
    "Acquisition",
    "Partnership", 
    "Joint Venture",
    "Licensing"
  ]
}
```

## 8. Monitoring and Observability

### 8.1 Health Checks

- `/health` - Basic health check
- `/ready` - Readiness probe with dependency checks

### 8.2 Logging

- Structured JSON logging with Winston
- Log levels: error, warn, info, debug
- Correlation IDs for request tracking

### 8.3 Metrics

- Job processing time
- API call counts and latency
- Evolution generation metrics
- Error rates by phase

## 9. Error Handling

### 9.1 Retry Strategy

- Cloud Tasks: 3 retries with exponential backoff
- API calls: Circuit breaker pattern
- Graceful degradation for non-critical failures

### 9.2 Error Types

1. **Validation Errors** (400)
   - Invalid problem context
   - Missing required parameters

2. **Processing Errors** (500)
   - LLM API failures
   - Timeout errors
   - Resource constraints

3. **Infrastructure Errors** (503)
   - Database unavailable
   - Queue service errors

## 10. Testing Strategy

### 10.1 Test Coverage

- Unit tests: Core algorithm, services
- Integration tests: API endpoints, cloud services
- E2E tests: Complete job processing flow

### 10.2 Test Configuration

- Jest test framework
- 80% coverage requirement
- Mocked external dependencies
- Test data fixtures