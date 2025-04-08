resource "google_project_service" "firebase" {
  project = var.project_id
  service = "firebase.googleapis.com"
  
  disable_dependent_services = true
}

# Note: Actual Firebase configuration is typically done via Firebase Console
# or Firebase CLI as Terraform support is limited