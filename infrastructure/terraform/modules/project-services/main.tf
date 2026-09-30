# Enables the Google Cloud APIs every other module depends on. Apply this module first;
# every environment passes `depends_on = [module.project_services]` to the modules that
# create resources on those APIs.

resource "google_project_service" "this" {
  for_each = toset(var.services)

  project = var.project_id
  service = each.value

  # Keep APIs enabled when the environment is destroyed: disabling APIs deletes resources
  # created outside Terraform (Firebase, logs) and is never what we want in practice.
  disable_on_destroy         = var.disable_on_destroy
  disable_dependent_services = false
}
