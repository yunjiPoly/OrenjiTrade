# Cloud SQL for PostgreSQL 17 with private IP only. PostGIS, pg_trgm, unaccent and pgcrypto
# are created by Flyway migration V001 (CREATE EXTENSION IF NOT EXISTS), not here.

resource "google_sql_database_instance" "this" {
  project          = var.project_id
  name             = var.instance_name
  region           = var.region
  database_version = "POSTGRES_17"

  # Terraform-level guard: `terraform destroy` refuses to delete the instance while true.
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    edition           = var.edition
    availability_type = var.availability_type
    disk_type         = "PD_SSD"
    disk_size         = var.disk_size_gb
    disk_autoresize   = true
    activation_policy = "ALWAYS"

    # API-level guard (also blocks console/gcloud deletes).
    deletion_protection_enabled = var.deletion_protection

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.point_in_time_recovery_enabled
      start_time                     = var.backup_start_time_utc
      location                       = var.backup_location
      transaction_log_retention_days = var.transaction_log_retention_days

      backup_retention_settings {
        retained_backups = var.retained_backups
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.network_id
      allocated_ip_range                            = var.allocated_ip_range
      ssl_mode                                      = "ENCRYPTED_ONLY"
      enable_private_path_for_google_cloud_services = true
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = false
    }

    maintenance_window {
      day          = var.maintenance_window_day
      hour         = var.maintenance_window_hour_utc
      update_track = "stable"
    }

    dynamic "database_flags" {
      for_each = var.database_flags
      content {
        name  = database_flags.value.name
        value = database_flags.value.value
      }
    }

    user_labels = var.labels
  }

  lifecycle {
    # Cloud SQL grows the disk automatically; never shrink it back from Terraform.
    ignore_changes = [settings[0].disk_size]
  }
}

resource "google_sql_database" "this" {
  project         = var.project_id
  instance        = google_sql_database_instance.this.name
  name            = var.database_name
  charset         = "UTF8"
  collation       = "en_US.UTF8"
  deletion_policy = var.deletion_protection ? "ABANDON" : "DELETE"
}

resource "google_sql_user" "app" {
  project         = var.project_id
  instance        = google_sql_database_instance.this.name
  name            = var.app_user_name
  password        = var.app_user_password
  type            = "BUILT_IN"
  deletion_policy = "ABANDON"
}
