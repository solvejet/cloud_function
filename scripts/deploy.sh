#!/bin/bash
set -e

ENVIRONMENT=\${1:-dev}
PROJECT_ID=\$(gcloud config get-value project)

echo "Deploying to \${ENVIRONMENT} environment in project \${PROJECT_ID}..."

# Build the application
echo "Building application..."
npm run build

# Build Docker image
echo "Building Docker image..."
docker build -t gcr.io/\${PROJECT_ID}/auth-rbac-api:latest .

# Push to Container Registry
echo "Pushing to Container Registry..."
docker push gcr.io/\${PROJECT_ID}/auth-rbac-api:latest

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy auth-rbac-api \\
  --image gcr.io/\${PROJECT_ID}/auth-rbac-api:latest \\
  --platform managed \\
  --region us-central1 \\
  --allow-unauthenticated

echo "Deployment complete!"