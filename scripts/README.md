# Deployment Scripts

Clean, minimal deployment scripts for the Evolution Solver microservice.

## Scripts

### `deploy.sh`
Unified deployment script for all services. Handles API, worker, and workflow deployments.

**Usage:**
```bash
./deploy.sh [environment] [action]

# Examples:
./deploy.sh                        # Deploy all to development
./deploy.sh staging api            # Deploy only API to staging
./deploy.sh production all         # Deploy all services to production
IMAGE_TAG=v1.2.3 ./deploy.sh production api  # Deploy specific version

# Deploy to a specific GCP project (overrides config):
GCP_PROJECT_ID=ai-trader-462511 ./deploy.sh production all

# Deploy with project and region overrides:
GCP_PROJECT_ID=ai-trader-462511 GCP_REGION=us-east1 ./deploy.sh production all
```

### `validate-config.sh`
Validates the configuration files without requiring external dependencies.

**Usage:**
```bash
./validate-config.sh            # Validate all config files
```

### `lib/config-loader.sh`
Library functions for loading configuration from `config/environments.yaml`. Used by the deploy script.

## Configuration

All deployment configuration is managed through:
- `config/environments.yaml` - Environment-specific settings

### Environment Variable Overrides

You can override configuration values using environment variables:

- `GCP_PROJECT_ID` - Override the target GCP project (e.g., `ai-trader-462511`)
- `GCP_REGION` - Override the deployment region
- `IMAGE_TAG` - Specify the Docker image tag to deploy
- `DRY_RUN=true` - Show what would be deployed without actually deploying

When `GCP_PROJECT_ID` is set, the service account email is automatically adjusted to match the target project.

## Design Philosophy

- **Minimal**: Only essential scripts, no unnecessary abstractions
- **Direct**: Uses gcloud CLI directly, no state management needed
- **Clear**: Configuration separated from logic
- **Simple**: Bash scripts that are easy to understand and modify