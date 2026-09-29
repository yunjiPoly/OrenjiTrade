# Generic Cloud Run (v2) service. Terraform owns the configuration (resources, scaling,
# networking, env vars, secret refs, probes, IAM); GitHub Actions owns the image. The image
# is therefore ignored after creation so that `deploy.yml` rollouts are never reverted by a
# later `terraform apply` (the placeholder image is only used on the very first apply).

resource "google_cloud_run_v2_service" "this" {
  project             = var.project_id
  name                = var.name
  location            = var.region
  description         = var.description
  ingress             = var.ingress
  launch_stage        = "GA"
  deletion_protection = var.deletion_protection
  custom_audiences    = var.custom_audiences
  labels              = var.labels

  template {
    service_account                  = var.service_account_email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "${var.request_timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency
    session_affinity                 = var.session_affinity
    labels                           = var.labels

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    dynamic "vpc_access" {
      for_each = var.vpc_connector_id == null ? [] : [1]
      content {
        connector = var.vpc_connector_id
        egress    = var.vpc_egress
      }
    }

    containers {
      name  = var.name
      image = var.image

      ports {
        name           = "http1"
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = var.startup_cpu_boost
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = var.startup_probe.initial_delay_seconds
        period_seconds        = var.startup_probe.period_seconds
        timeout_seconds       = var.startup_probe.timeout_seconds
        failure_threshold     = var.startup_probe.failure_threshold
        http_get {
          path = var.startup_probe.path
          port = var.container_port
        }
      }

      dynamic "liveness_probe" {
        for_each = var.liveness_probe == null ? [] : [var.liveness_probe]
        content {
          initial_delay_seconds = liveness_probe.value.initial_delay_seconds
          period_seconds        = liveness_probe.value.period_seconds
          timeout_seconds       = liveness_probe.value.timeout_seconds
          failure_threshold     = liveness_probe.value.failure_threshold
          http_get {
            path = liveness_probe.value.path
            port = var.container_port
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      template[0].labels["run.googleapis.com/startupProbeType"],
      template[0].annotations,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = var.project_id
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)

  project  = var.project_id
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = each.value
}
