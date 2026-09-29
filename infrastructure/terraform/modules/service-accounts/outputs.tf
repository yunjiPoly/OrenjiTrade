output "emails" {
  description = "Map key => service account email."
  value       = { for k, sa in google_service_account.this : k => sa.email }
}

output "members" {
  description = "Map key => IAM member string (serviceAccount:...)."
  value       = { for k, sa in google_service_account.this : k => sa.member }
}

output "names" {
  description = "Map key => full resource name (projects/../serviceAccounts/..)."
  value       = { for k, sa in google_service_account.this : k => sa.name }
}
