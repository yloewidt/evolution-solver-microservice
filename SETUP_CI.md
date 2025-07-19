# Setting Up CI/CD

The GitHub Actions workflow file needs to be added manually due to permissions.

## Steps:

1. Go to: https://github.com/yloewidt/evolution-solver-microservice

2. Create the file `.github/workflows/ci.yml` with the following content:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  GCP_PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  GCP_SA_KEY: ${{ secrets.GCP_SA_KEY }}
  SERVICE_NAME: evolution-solver

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint --if-present
    
    - name: Run tests
      run: npm test
      env:
        OPENAI_API_KEY: test-key
    
    - name: Generate coverage report
      run: npm run test:coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Build Docker image
      run: |
        docker build -t $SERVICE_NAME:$GITHUB_SHA .
        docker tag $SERVICE_NAME:$GITHUB_SHA $SERVICE_NAME:latest
    
    - name: Save Docker image
      run: |
        docker save $SERVICE_NAME:$GITHUB_SHA > evolution-solver.tar
    
    - name: Upload Docker image artifact
      uses: actions/upload-artifact@v3
      with:
        name: docker-image
        path: evolution-solver.tar
        retention-days: 1

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment: staging
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Download Docker image artifact
      uses: actions/download-artifact@v3
      with:
        name: docker-image
    
    - name: Load Docker image
      run: docker load < evolution-solver.tar
    
    - name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v1
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}
    
    - name: Set up Cloud SDK
      uses: google-github-actions/setup-gcloud@v1
    
    - name: Configure Docker for GCR
      run: gcloud auth configure-docker
    
    - name: Push to GCR
      run: |
        docker tag $SERVICE_NAME:$GITHUB_SHA gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
        docker tag $SERVICE_NAME:$GITHUB_SHA gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:staging
        docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
        docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:staging
    
    - name: Deploy to Cloud Run (Staging)
      run: |
        gcloud run deploy $SERVICE_NAME-staging \
          --image gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
          --platform managed \
          --region us-central1 \
          --allow-unauthenticated \
          --set-env-vars ENVIRONMENT=staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Download Docker image artifact
      uses: actions/download-artifact@v3
      with:
        name: docker-image
    
    - name: Load Docker image
      run: docker load < evolution-solver.tar
    
    - name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v1
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}
    
    - name: Set up Cloud SDK
      uses: google-github-actions/setup-gcloud@v1
    
    - name: Configure Docker for GCR
      run: gcloud auth configure-docker
    
    - name: Push to GCR
      run: |
        docker tag $SERVICE_NAME:$GITHUB_SHA gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
        docker tag $SERVICE_NAME:$GITHUB_SHA gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:latest
        docker tag $SERVICE_NAME:$GITHUB_SHA gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:production
        docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA
        docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:latest
        docker push gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:production
    
    - name: Deploy to Cloud Run (Production)
      run: |
        gcloud run deploy $SERVICE_NAME-production \
          --image gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME:$GITHUB_SHA \
          --platform managed \
          --region us-central1 \
          --allow-unauthenticated \
          --set-env-vars ENVIRONMENT=production \
          --memory 4Gi \
          --cpu 2 \
          --min-instances 1 \
          --max-instances 100
```

3. Set up the required secrets in GitHub:
   - Go to Settings → Secrets and variables → Actions
   - Add:
     - `GCP_PROJECT_ID`: Your Google Cloud project ID
     - `GCP_SA_KEY`: Your service account JSON key

The CI/CD pipeline will then run automatically on every push!