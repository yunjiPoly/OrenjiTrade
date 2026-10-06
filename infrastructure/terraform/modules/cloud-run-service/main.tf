# Generic Cloud Run (v2) service. Terraform owns the configuration (resources, scaling,
# networking, env vars, secret refs, probes, IAM, sidecars); GitHub Actions owns the image of
# the main container. That image is therefore ignored after creation so that `deploy.yml`
# rollouts are never reverted by a later `terraform apply` (the placeholder image is only used
# on the very first apply). Sidecar images (pinned by digest) stay Terraform-managed.
#
# Networking: either a Serverless VPC Access connector (`vpc_connector_id`) or Direct VPC
# egress (`vpc_subnetwork`, no connector VMs to pay for). Sidecars share the instance's network
# namespace with the main container (localhost) and are started first: the main container
# declares `depends_on` on every sidecar and each sidecar needs a startup probe, otherwise
# Cloud Run starts the containers in order without waiting for them to be healthy.

locals {
  container_name = coalesce(var.container_name, var.name)
  sidecar_names  = [for s in var.sidecars : s.name]
  direct_vpc     = var.vpc_subnetwork != null
  vpc_enabled    = var.vpc_connector_id != null || local.direct_vpc
}

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
    execution_environment            = var.execution_environment
    timeout                          = "${var.request_timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency
    session_affinity                 = var.session_affinity
    labels                           = var.labels

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    dynamic "vpc_access" {
      for_each = local.vpc_enabled ? [1] : []
      content {
        connector = var.vpc_connector_id
        egress    = var.vpc_egress

        # Direct VPC egress: the instance gets an IP from the subnet, no connector in between.
        dynamic "network_interfaces" {
          for_each = local.direct_vpc ? [1] : []
          content {
            network    = var.vpc_network
            subnetwork = var.vpc_subnetwork
            tags       = var.vpc_network_tags
          }
        }
      }
    }

    dynamic "volumes" {
      for_each = var.volumes
      content {
        name = volumes.value.name
        empty_dir {
          medium     = "MEMORY"
          size_limit = volumes.value.size_limit
        }
      }
    }

    # The ingress (main) container is always containers[0]; lifecycle.ignore_changes relies on
    # that index, so sidecars must stay after it.
    containers {
      name       = local.container_name
      image      = var.image
      depends_on = length(local.sidecar_names) > 0 ? local.sidecar_names : null

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

      dynamic "volume_mounts" {
        for_each = var.volume_mounts
        content {
          name       = volume_mounts.value.name
          mount_path = volume_mounts.value.mount_path
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

    # Sidecars (no ports: only the ingress container receives traffic). Each one has its own
    # CPU/memory limits; the instance is billed for the sum of all containers.
    dynamic "containers" {
      for_each = var.sidecars
      content {
        name    = containers.value.name
        image   = containers.value.image
        command = containers.value.command
        args    = containers.value.args

        resources {
          limits = {
            cpu    = containers.value.cpu
            memory = containers.value.memory
          }
          cpu_idle          = var.cpu_idle
          startup_cpu_boost = var.startup_cpu_boost
        }

        dynamic "env" {
          for_each = containers.value.env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "volume_mounts" {
          for_each = containers.value.volume_mounts
          content {
            name       = volume_mounts.value.name
            mount_path = volume_mounts.value.mount_path
          }
        }

        dynamic "startup_probe" {
          for_each = containers.value.startup_probe == null ? [] : [containers.value.startup_probe]
          content {
            initial_delay_seconds = startup_probe.value.initial_delay_seconds
            period_seconds        = startup_probe.value.period_seconds
            timeout_seconds       = startup_probe.value.timeout_seconds
            failure_threshold     = startup_probe.value.failure_threshold

            dynamic "tcp_socket" {
              for_each = startup_probe.value.tcp_port == null ? [] : [startup_probe.value.tcp_port]
              content {
                port = tcp_socket.value
              }
            }

            dynamic "http_get" {
              for_each = startup_probe.value.http_path == null ? [] : [startup_probe.value]
              content {
                path = http_get.value.http_path
                port = http_get.value.http_port
              }
            }
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
