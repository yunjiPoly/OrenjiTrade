output "bucket_name" {
  description = "Media bucket name (GCS_BUCKET_MEDIA)."
  value       = google_storage_bucket.media.name
}

output "bucket_url" {
  description = "gs:// URL of the media bucket."
  value       = google_storage_bucket.media.url
}

output "bucket_self_link" {
  description = "Self link of the media bucket."
  value       = google_storage_bucket.media.self_link
}
