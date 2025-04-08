resource "google_cloud_run_service" "auth_api" {
  name     = "auth-rbac-api"
  location = var.region

  template {
    spec {
      containers {
        image = "gcr.io/${var.project_id}/auth-rbac-api:latest"
        
        resources {
          limits = {
            cpu    = "1000m"
            memory = "512Mi"
          }
        }
        
        env {
          name  = "NODE_ENV"
          value = var.environment
        }
        
        env {
          name  = "PROJECT_ID"
          value = var.project_id
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }
}

resource "google_cloud_run_service_iam_member" "auth_api_public" {
  service  = google_cloud_run_service.auth_api.name
  location = google_cloud_run_service.auth_api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_url" {
  value = google_cloud_run_service.auth_api.status[0].url
}