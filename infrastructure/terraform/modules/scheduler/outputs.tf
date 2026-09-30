output "job_names" {
  description = "Map job key => Cloud Scheduler job name."
  value       = { for k, j in google_cloud_scheduler_job.this : k => j.name }
}

output "job_ids" {
  description = "Map job key => full job id."
  value       = { for k, j in google_cloud_scheduler_job.this : k => j.id }
}
