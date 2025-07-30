# Infrastructure as Code (IAC) Configuration

This directory contains the Infrastructure as Code configuration for the Evolution Solver microservice. The configuration is designed to be simple, maintainable, and DRY (Don't Repeat Yourself).

## Structure

```
config/
├── environments.yaml    # Environment-specific configurations
├── resources.yaml      # Resource definitions
├── deploy.yaml        # Deployment strategies and build config
└── README.md          # This file
```

## Configuration Files

### environments.yaml
Defines environment-specific settings for development, staging, and production:
- Service configurations (memory, CPU, scaling)
- Environment variables
- CORS settings
- Logging levels

### resources.yaml
Defines the infrastructure resources:
- Cloud Run services (API and Worker)
- Cloud Tasks queues
- Firestore databases and collections
- IAM service accounts and roles
- Cloud Workflows

### deploy.yaml
Defines deployment strategies and Cloud Build configuration:
- Build settings
- Deployment triggers
- Deployment strategies (direct, canary, blue-green)
- Pre/post deployment hooks

## Usage

### Prerequisites
1. Install `yq` for YAML parsing:
   ```bash
   # macOS
   brew install yq
   
   # Linux
   sudo snap install yq
   # or
   wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
   chmod +x /usr/local/bin/yq
   ```

2. Ensure you have `gcloud` CLI installed and configured

### Deployment Commands

Deploy all services to development:
```bash
./scripts/deploy
```

Deploy specific service to specific environment:
```bash
./scripts/deploy staging api
./scripts/deploy production worker
```

Deploy with specific image tag:
```bash
IMAGE_TAG=v1.2.3 ./scripts/deploy production all
```

Dry run (see what would be deployed):
```bash
DRY_RUN=true ./scripts/deploy production all
```

### Cloud Build Integration

The `cloudbuild.yaml` is configured to work with these configurations. When triggered:

1. With `_DEPLOY=false` (default): Only builds and pushes the Docker image
2. With `_DEPLOY=true`: Builds, pushes, and deploys using the unified script

Example trigger command:
```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=staging,_DEPLOY=true
```

## Environment Variables

The deployment script automatically sets these environment variables based on the configuration:

- `NODE_ENV`: Set to the environment name
- `GCP_PROJECT_ID`: From defaults.project_id
- `FIRESTORE_DATABASE`: From defaults.firestore_database
- `FIRESTORE_COLLECTION`: From defaults.firestore_collection
- `CLOUD_TASKS_QUEUE`: From defaults.cloud_tasks_queue
- `CLOUD_TASKS_LOCATION`: From defaults.cloud_tasks_location
- `SERVICE_ACCOUNT_EMAIL`: From defaults.service_account
- `ALLOWED_ORIGINS`: From environments.[env].allowed_origins
- `LOG_LEVEL`: From environments.[env].log_level
- `EVOLUTION_WORKER_URL`: Automatically set after API deployment
- `OPENAI_API_KEY`: From Secret Manager

## Validation

Run the validation script to check configuration:
```bash
./scripts/validate-config.sh
```

Run the test script to validate the deployment system:
```bash
./scripts/test-deployment.sh
```

## Migration from Old Scripts

This IAC approach replaces the following scripts:
- `scripts/deploy.sh`
- `scripts/deploy-worker.sh`
- Individual deployment logic in `cloudbuild.yaml`

The new system provides:
- Single source of truth for all configuration
- Environment-specific settings without code duplication
- Easier maintenance and updates
- Better visibility into what's deployed where

## Adding New Environments

To add a new environment:

1. Add the environment configuration to `environments.yaml`:
   ```yaml
   environments:
     new-env:
       api:
         service_name: evolution-solver-newenv
         memory: 1Gi
         # ... other settings
   ```

2. Deploy using:
   ```bash
   ./scripts/deploy new-env all
   ```

## Troubleshooting

1. **yq not found**: Install yq as shown in prerequisites
2. **Permission denied**: Make scripts executable with `chmod +x scripts/*`
3. **Config not loading**: Run `./scripts/validate-config.sh` to check YAML syntax
4. **Deployment fails**: Check service account permissions and API enablement