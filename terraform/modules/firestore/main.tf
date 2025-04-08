resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"
}

resource "google_firestore_index" "users_by_role" {
  project = var.project_id
  collection = "userRoles"
  
  fields {
    field_path = "roleIds"
    order      = "ASCENDING"
  }
  
  fields {
    field_path = "userId"
    order      = "ASCENDING"
  }
  
  depends_on = [google_firestore_database.database]
}