# module: project-services

Enables the Google Cloud APIs used by an OrenjiTrade environment (Cloud Run, Cloud SQL,
Memorystore, Pub/Sub, BigQuery, Secret Manager, Artifact Registry, Scheduler, Monitoring,
Identity Platform, Workload Identity Federation, ...).

| Input | Default | Notes |
| --- | --- | --- |
| `project_id` | — | Target project |
| `services` | full OrenjiTrade list | Override only to add APIs |
| `disable_on_destroy` | `false` | Never disable APIs in shared projects |

Outputs: `enabled_services`, `project_id`.

Every other module in an environment should declare `depends_on = [module.project_services]`
so the first `terraform apply` on a fresh project does not race the API enablement.
