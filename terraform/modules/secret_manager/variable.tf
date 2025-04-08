variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "cloud_run_service_account" {
  description = "Service account email for Cloud Run"
  type        = string
  default     = "service-account@example.com"
}