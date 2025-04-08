output "api_url" {
  value       = module.cloudrun.service_url
  description = "The URL of the deployed API"
}

output "firestore_database" {
  value       = module.firestore.database_name
  description = "The Firestore database name"
}