# Memorystore for Redis reached over Private Service Access. BASIC in dev, STANDARD_HA in prod.
# Redis holds caches, rate-limit buckets, presence and realtime fan-out; never primary data.

resource "google_redis_instance" "this" {
  project                 = var.project_id
  name                    = var.instance_name
  display_name            = var.display_name
  region                  = var.region
  tier                    = var.tier
  memory_size_gb          = var.memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.network_id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = var.transit_encryption_mode
  replica_count           = var.tier == "STANDARD_HA" ? var.replica_count : null
  read_replicas_mode      = var.tier == "STANDARD_HA" && var.replica_count > 0 ? "READ_REPLICAS_ENABLED" : "READ_REPLICAS_DISABLED"
  deletion_protection     = var.deletion_protection

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }

  persistence_config {
    persistence_mode    = var.persistence_enabled ? "RDB" : "DISABLED"
    rdb_snapshot_period = var.persistence_enabled ? "TWELVE_HOURS" : null
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 9
        minutes = 0
      }
    }
  }

  labels = var.labels
}
