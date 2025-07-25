# Evolution Solver Microservice

A standalone microservice for running evolutionary algorithms to generate innovative business solutions using OpenAI's o3 model.

## Production Status ✅

- **Parallel Enrichment**: Working - Each idea gets its own API call
- **o3 Model Integration**: Functional with structured output
- **Full Pipeline**: Variator → Enricher (parallel) → Ranker operational
- **Performance**: ~12-15 seconds per idea enrichment with o3 model

**Repository**: https://github.com/yloewidt/evolution-solver-microservice

## Features

- Evolutionary algorithm implementation using OpenAI o3
- REST API for job submission and result retrieval
- Cloud Run deployment for scalable processing
- Firestore integration for result persistence
- Cloud Tasks for async job processing
- Configurable evolution parameters

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│   REST API   │────▶│ Cloud Tasks │
└─────────────┘     └──────────────┘     └─────────────┘
                            │                     │
                            ▼                     ▼
                    ┌──────────────┐     ┌─────────────┐
                    │  Firestore   │◀────│ Cloud Run   │
                    └──────────────┘     │   Worker    │
                                        └─────────────┘
```

## API Endpoints

### Submit Evolution Job
```
POST /api/evolution/jobs
{
  "problemContext": "string",
  "evolutionConfig": {
    "generations": 10,
    "populationSize": 5,
    "model": "o3",
    "maxCapex": 50,
    "minProfits": 10
  }
}
```

### Direct Job Processing (Bypasses Workflow)
```
POST /api/evolution/direct
{
  "problemContext": "string",
  "evolutionConfig": {
    "populationSize": 3,
    "model": "o3"
  }
}
```

### Get Job Status
```
GET /api/evolution/jobs/:jobId
```

### Get Results
```
GET /api/evolution/results/:jobId
```

### List Jobs
```
GET /api/evolution/jobs?status=completed&limit=50
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Run locally:
```bash
npm start
```

## Docker

Build and run with Docker:
```bash
docker build -t evolution-solver .
docker run -p 8080:8080 --env-file .env evolution-solver
```

## Deployment

Deploy to Google Cloud Run:
```bash
./scripts/deploy.sh production
```

## Testing

Run tests:
```bash
npm test
```

## Configuration

Environment variables:
- `OPENAI_API_KEY` - OpenAI API key
- `GCP_PROJECT_ID` - Google Cloud project ID
- `FIRESTORE_DATABASE` - Firestore database ID
- `CLOUD_TASKS_QUEUE` - Cloud Tasks queue name
- `PORT` - Server port (default: 8080)

## License

MIT