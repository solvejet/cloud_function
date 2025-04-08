terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
  backend "gcs" {
    bucket = "tf-state-auth-rbac-system"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "firebase" {
  source     = "./modules/firebase"
  project_id = var.project_id
}

module "cloudrun" {
  source     = "./modules/cloudrun"
  project_id = var.project_id
  region     = var.region
}

module "firestore" {
  source     = "./modules/firestore"
  project_id = var.project_id
}

module "secret_manager" {
  source     = "./modules/secret_manager"
  project_id = var.project_id
}