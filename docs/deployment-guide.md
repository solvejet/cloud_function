# Comprehensive Deployment Guide for Auth RBAC System on GCP

This guide provides step-by-step instructions for deploying your Auth RBAC system to Google Cloud Platform (GCP) using GitHub for CI/CD.

## Table of Contents

1. [GitHub Repository Setup](#1-github-repository-setup)
2. [GCP Project Configuration](#2-gcp-project-configuration)
3. [Firebase Project Setup](#3-firebase-project-setup)
4. [Infrastructure Deployment with Terraform](#4-infrastructure-deployment-with-terraform)
5. [CI/CD Pipeline Setup](#5-cicd-pipeline-setup)
6. [Database Initialization](#6-database-initialization)
7. [Application Deployment](#7-application-deployment)
8. [Testing the Deployment](#8-testing-the-deployment)
9. [Post-Deployment Tasks](#9-post-deployment-tasks)

## 1. GitHub Repository Setup

### 1.1 Create a New Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top-right corner and select "New repository"
3. Name the repository `auth-rbac-system`
4. Choose "Private" for visibility
5. Check "Add a README file"
6. Click "Create repository"

### 1.2 Push Your Code to GitHub

```bash
# Clone the repository
git clone https://github.com/solvejet/cloud_function.git
cd auth-rbac-system

# Copy your project files to the repository (excluding node_modules and dist)
cp -r /path/to/your/project/* .
rm -rf node_modules dist

# Add, commit, and push your code
git add .
git commit -m "Initial commit: Auth RBAC System"
git push origin main
```

### 1.3 Create Development Branch

```bash
# Create and switch to a development branch
git checkout -b develop
git push -u origin develop
```

### 1.4 Configure Branch Protection Rules

1. Navigate to your repository on GitHub
2. Go to Settings > Branches
3. Under "Branch protection rules", click "Add rule"
4. For "Branch name pattern", enter `main`
5. Enable:
   - Require pull request reviews before merging
   - Require status checks to pass before merging
   - Include administrators
6. Click "Create"
7. Repeat for the `develop` branch

## 2. GCP Project Configuration

### 2.1 Create a New GCP Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top of the page
3. Click "New Project"
4. Enter "auth-rbac-system" as the project name
5. Select an organization and billing account
6. Click "Create"

### 2.2 Enable Required APIs

```bash
# Install Google Cloud SDK if you haven't already
# Follow instructions at https://cloud.google.com/sdk/docs/install

# Set your project ID
export PROJECT_ID=auth-rbac-system-$(date +%s)
gcloud projects create $PROJECT_ID

# Set the active project
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable firestore.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable firebase.googleapis.com
gcloud services enable iam.googleapis.com
```

### 2.3 Create Service Account for Deployment

```bash
# Create a service account for GitHub Actions
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account"

# Grant necessary permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/editor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/firebase.admin"

# Create and download key for GitHub Actions
gcloud iam service-accounts keys create key.json \
  --iam-account="github-actions@$PROJECT_ID.iam.gserviceaccount.com"
```

### 2.4 Create Storage Bucket for Terraform State

```bash
# Create a storage bucket for Terraform state
gcloud storage buckets create gs://tf-state-$PROJECT_ID \
  --location="us-central1" \
  --uniform-bucket-level-access
```

## 3. Firebase Project Setup

### 3.1 Add Firebase to Your GCP Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Select your GCP project from the dropdown
4. Follow the setup wizard to completion

### 3.2 Configure Firebase Authentication

1. In the Firebase Console, navigate to Authentication
2. Click "Get started"
3. Enable Email/Password sign-in
4. Optionally, enable other sign-in methods as needed

### 3.3 Set Up Firestore Database

1. Navigate to Firestore Database in Firebase Console
2. Click "Create database"
3. Choose "Start in production mode"
4. Select a location close to your users (e.g., "us-central")
5. Click "Enable"

### 3.4 Generate Firebase Admin SDK Service Account

1. In Firebase Console, go to Project Settings > Service accounts
2. Click "Generate new private key" under Firebase Admin SDK
3. Save the key file securely

## 4. Infrastructure Deployment with Terraform

### 4.1 Update Terraform Variables

1. Edit `terraform/environments/dev/terraform.tfvars`:

   ```
   project_id = "your-project-id"
   region     = "us-central1"
   ```

2. Edit `terraform/environments/prod/terraform.tfvars`:
   ```
   project_id = "your-project-id"
   region     = "us-central1"
   ```

### 4.2 Initialize and Apply Terraform

```bash
# Navigate to the terraform directory
cd terraform/environments/dev

# Initialize Terraform
terraform init -backend-config="bucket=tf-state-$PROJECT_ID"

# Plan the deployment
terraform plan

# Apply the configuration
terraform apply -auto-approve
```

## 5. CI/CD Pipeline Setup

### 5.1 Add GitHub Secrets

1. Navigate to your GitHub repository
2. Go to Settings > Secrets and variables > Actions
3. Click "New repository secret"
4. Add the following secrets:
   - `GCP_PROJECT_ID`: Your GCP project ID
   - `GCP_SA_KEY`: The content of the service account key file (key.json)
   - `FIREBASE_SA_KEY`: The content of the Firebase Admin SDK key file

### 5.2 Update GitHub Workflows

The workflows are already included in the code. Just make sure they're correctly configured:

1. Check `.github/workflows/ci.yml` for any project-specific settings
2. Check `.github/workflows/cd.yml` for deployment configuration

### 5.3 Set Up Cloud Build (Optional Alternative to GitHub Actions)

```bash
# Create a cloudbuild.yaml file in your repository
cat > cloudbuild.yaml << EOL
steps:
  # Install dependencies
  - name: 'node:22'
    entrypoint: npm
    args: ['ci']

  # Run tests
  - name: 'node:22'
    entrypoint: npm
    args: ['test']

  # Build
  - name: 'node:22'
    entrypoint: npm
    args: ['run', 'build']

  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/auth-rbac-api:$COMMIT_SHA', '.']

  # Push the container image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/auth-rbac-api:$COMMIT_SHA']

  # Deploy container image to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'auth-rbac-api'
      - '--image=gcr.io/$PROJECT_ID/auth-rbac-api:$COMMIT_SHA'
      - '--region=us-central1'
      - '--platform=managed'
      - '--allow-unauthenticated'

images:
  - 'gcr.io/$PROJECT_ID/auth-rbac-api:$COMMIT_SHA'
EOL

# Set up a Cloud Build trigger
gcloud builds triggers create github \
  --repo="yourusername/auth-rbac-system" \
  --branch-pattern="main" \
  --build-config="cloudbuild.yaml"
```

## 6. Database Initialization

### 6.1 Upload Firebase Service Account Key to Secret Manager

```bash
# Create a secret for the Firebase service account key
gcloud secrets create firebase-admin-key \
  --replication-policy="automatic"

# Upload the key to the secret
gcloud secrets versions add firebase-admin-key \
  --data-file="path/to/firebase-admin-key.json"
```

### 6.2 Run Database Seeding Script

```bash
# Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS="path/to/firebase-admin-key.json"

# Run seeding script
npx ts-node scripts/seed.ts
```

## 7. Application Deployment

### 7.1 Manual Deployment

```bash
# Build the application
npm run build

# Build and push the Docker image
docker build -t gcr.io/$PROJECT_ID/auth-rbac-api:latest .
docker push gcr.io/$PROJECT_ID/auth-rbac-api:latest

# Deploy to Cloud Run
gcloud run deploy auth-rbac-api \
  --image gcr.io/$PROJECT_ID/auth-rbac-api:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars="PROJECT_ID=$PROJECT_ID" \
  --allow-unauthenticated
```

### 7.2 Deploy via GitHub Actions

Simply push your code to the `main` branch, and GitHub Actions will handle the deployment:

```bash
git checkout main
git merge develop
git push origin main
```

## 8. Testing the Deployment

### 8.1 Get the Deployment URL

```bash
# Get the deployed service URL
gcloud run services describe auth-rbac-api \
  --platform managed \
  --region us-central1 \
  --format="value(status.url)"
```

### 8.2 Test the API Endpoints

```bash
# Health check
curl https://your-deployed-url/health

# Create an admin account via Firebase Auth
firebase auth:create-user --uid=admin --email=admin@example.com --password=securePassword
```

## 9. Post-Deployment Tasks

### 9.1 Set Up Monitoring

1. Navigate to GCP Console > Monitoring
2. Create a dashboard for your service
3. Set up alerts for errors and high latency

### 9.2 Configure Logging

1. Navigate to GCP Console > Logging
2. Create custom logs-based metrics
3. Set up log-based alerts

### 9.3 Set Up Domain and SSL

1. Register a domain or use an existing one
2. Configure a mapping in Cloud Run:
   ```bash
   gcloud beta run domain-mappings create \
     --service auth-rbac-api \
     --domain api.yourdomain.com \
     --region us-central1
   ```
3. Follow the instructions to update your DNS settings

### 9.4 Security Hardening

1. Implement rate limiting
2. Set up Google Cloud Armor for DDoS protection
3. Configure VPC Service Controls (if needed)
4. Review IAM permissions regularly

---

## Additional Notes

### Environment Variables

Make sure to set the following environment variables in your Cloud Run service:

- `NODE_ENV`: Set to "production"
- `PROJECT_ID`: Your GCP project ID

### Scaling Configuration

Configure the scaling parameters for Cloud Run:

```bash
gcloud run services update auth-rbac-api \
  --concurrency=80 \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=10 \
  --region=us-central1
```

### Cost Optimization

- Set up budget alerts in GCP Billing
- Optimize Cloud Run instances for cost
- Use Firebase Blaze plan for production
