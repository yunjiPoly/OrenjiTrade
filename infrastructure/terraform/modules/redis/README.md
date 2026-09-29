# module: redis

Memorystore for Redis (7.2) over Private Service Access with AUTH enabled. `BASIC` tier for
dev/staging; `STANDARD_HA` with automatic failover for prod.

| Input | Default | Notes |
| --- | --- | --- |
| `instance_name` | — | e.g. `orenjitrade-dev` |
| `network_id` | — | from the `network` module |
| `tier` | `BASIC` | prod: `STANDARD_HA` |
| `memory_size_gb` | `1` | STANDARD_HA minimum is 5 |
| `replica_count` | `0` | STANDARD_HA only |
| `transit_encryption_mode` | `DISABLED` | switch to `SERVER_AUTHENTICATION` once the API trusts the Memorystore CA |
| `persistence_enabled` | `false` | prod: `true` |
| `deletion_protection` | `false` | prod: `true` |

Outputs: `host`, `port`, `auth_string` (sensitive), `redis_url` (sensitive), `instance_id`,
`instance_name`. The environment writes `redis_url` into the `redis-url` secret consumed by
the API as `REDIS_URL`.
