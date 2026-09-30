# Cloud Scheduler jobs that call the API's internal job endpoints (/internal/jobs/*) with a
# Google-signed OIDC token minted for the scheduler service account. The API must verify the
# token (issuer accounts.google.com, audience = oidc_audience, email = scheduler SA) before
# running a job; Cloud Run IAM additionally requires roles/run.invoker when the token is
# checked at the platform level.

resource "google_cloud_scheduler_job" "this" {
  for_each = var.jobs

  project          = var.project_id
  region           = var.region
  name             = "${var.name_prefix}${each.key}"
  description      = each.value.description
  schedule         = each.value.schedule
  time_zone        = each.value.time_zone
  attempt_deadline = "${each.value.attempt_deadline_seconds}s"
  paused           = each.value.paused

  retry_config {
    retry_count          = each.value.retry_count
    min_backoff_duration = "30s"
    max_backoff_duration = "600s"
    max_doublings        = 3
  }

  http_target {
    uri         = "${trimsuffix(var.base_url, "/")}${each.value.path}"
    http_method = each.value.http_method
    headers = {
      "Content-Type" = "application/json"
      "User-Agent"   = "OrenjiTrade-Scheduler/1.0"
    }
    body = each.value.body == null ? null : base64encode(each.value.body)

    oidc_token {
      service_account_email = var.service_account_email
      audience              = coalesce(var.oidc_audience, var.base_url)
    }
  }
}
