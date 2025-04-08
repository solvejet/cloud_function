resource "google_project_service" "secretmanager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"
  
  disable_dependent_services = true
}

resource "google_secret_manager_secret" "firebase_admin_key" {
  project   = var.project_id
  secret_id = "firebase-admin-key"
  
  replication {
    user_managed {
      replicas {
        location = "us-central1"
      }
    }
  }
  
  depends_on = [google_project_service.secretmanager]
}

# IAM binding for Cloud Run to access secrets
resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.firebase_admin_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_service_account}"
}