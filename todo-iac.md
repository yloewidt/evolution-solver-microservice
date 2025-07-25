# Infrastructure as Code (IAC) Proposal

## Current State Analysis

### Problems Identified

1. **Duplication Everywhere**
   - Same deployment logic in 3 places: `deploy.sh`, `deploy-worker.sh`, `cloudbuild.yaml`
   - Hardcoded values repeated across scripts (project ID, regions, memory limits)
   - Environment-specific logic scattered throughout

2. **Brittle Dependencies**
   - Scripts call each other (`deploy.sh` → `deploy-worker.sh`)
   - Hardcoded paths to local user directories (`/Users/yonatanloewidt/google-cloud-sdk/bin`)
   - Manual URL manipulation with sed commands

3. **No Clear Separation of Concerns**
   - Infrastructure config mixed with deployment logic
   - No clear way to see what resources exist
   - Difficult to understand the full architecture at a glance

## Proposed Solution: Simple Yet Robust

### Principle: One Source of Truth, Multiple Deployment Methods

```
config/
├── environments.yaml     # All environment-specific values
├── resources.yaml       # Resource definitions (what we deploy)
└── deploy.yaml         # How we deploy (Cloud Build config)
```

### 1. Environment Configuration (`config/environments.yaml`)

```yaml
defaults:
  project_id: evolutionsolver
  region: us-central1
  service_account: evolution-solver@evolutionsolver.iam.gserviceaccount.com

environments:
  development:
    api:
      memory: 1Gi
      cpu: 1
      max_instances: 2
    worker:
      memory: 2Gi
      cpu: 1
      max_instances: 5
    
  staging:
    api:
      memory: 1Gi
      cpu: 1
      max_instances: 5
    worker:
      memory: 2Gi
      cpu: 2
      max_instances: 20
    
  production:
    api:
      memory: 1Gi
      cpu: 1
      max_instances: 10
    worker:
      memory: 4Gi
      cpu: 2
      max_instances: 100
```

### 2. Single Deployment Script (`scripts/deploy`)

```bash
#!/bin/bash
# Simple, readable deployment script that uses config files

ENV=${1:-development}
ACTION=${2:-all}  # all, api, worker, workflow

# Load configuration
source scripts/lib/config-loader.sh
load_config $ENV

# Deploy based on action
case $ACTION in
  api)     deploy_api ;;
  worker)  deploy_worker ;;
  workflow) deploy_workflow ;;
  all)     deploy_api && deploy_worker && deploy_workflow ;;
esac
```

### 3. Cloud Build Configuration (`cloudbuild.yaml`)

Keep it simple - just build and push. Let deployment happen through the script OR through Cloud Build triggers with substitutions.

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/evolution-solver:$SHORT_SHA', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/evolution-solver:$SHORT_SHA']
  
  # Optional: deploy if triggered with _DEPLOY=true
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: 'bash'
    args: ['./scripts/deploy', '${_ENVIRONMENT}']
    env:
      - 'IMAGE_TAG=$SHORT_SHA'
```

## Benefits

1. **Single Source of Truth**: All configuration in YAML files
2. **DRY**: No repeated values or logic
3. **Readable**: Can understand entire infrastructure from config files
4. **Flexible**: Easy to add new environments or change resources
5. **CI/CD Ready**: Works with both local and Cloud Build deployments

## Migration Path

1. **Phase 1**: Create config files and new deploy script alongside existing scripts
2. **Phase 2**: Test new script in development environment
3. **Phase 3**: Migrate staging and production
4. **Phase 4**: Remove old scripts

## Alternative Consideration: Terraform

While Terraform would provide more features, it adds complexity that may not be needed for this simple architecture. The proposed YAML + script approach maintains simplicity while solving the current problems.

## Next Steps

1. Create the config file structure
2. Build the unified deploy script with config loader
3. Test in development environment
4. Document the new deployment process
5. Remove old deployment scripts