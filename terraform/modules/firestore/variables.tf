variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "firestore_location" {
  description = "The Firestore database location"
  type        = string
  default     = "us-central"
}