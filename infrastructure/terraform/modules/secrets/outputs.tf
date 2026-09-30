output "secret_ids" {
  description = "Map secret id => secret id (short name, usable in Cloud Run secret_key_ref)."
  value       = { for k, s in google_secret_manager_secret.this : k => s.secret_id }
}

output "secret_names" {
  description = "Map secret id => full resource name (projects/../secrets/..)."
  value       = { for k, s in google_secret_manager_secret.this : k => s.name }
}

output "operator_managed_secret_ids" {
  description = "Secrets whose first version must be added by an operator before the services can start."
  value       = [for k, s in var.secrets : k if !s.terraform_managed]
}
