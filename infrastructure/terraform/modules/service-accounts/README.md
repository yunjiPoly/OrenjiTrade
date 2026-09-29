# module: service-accounts

Creates the environment's identities with least-privilege project roles. Defaults:

| Key | Purpose | Project roles |
| --- | --- | --- |
| `api-run` | api Cloud Run runtime | cloudsql.client, logging.logWriter, monitoring.metricWriter, cloudtrace.agent, firebaseauth.admin, firebasecloudmessaging.admin |
| `web-run` | web Cloud Run runtime | logging.logWriter, monitoring.metricWriter |
| `ml-run` | ml Cloud Run runtime | logging.logWriter, monitoring.metricWriter, cloudtrace.agent |
| `scheduler` | Cloud Scheduler OIDC identity | none (run.invoker granted on the api service) |
| `pubsub-push` | Pub/Sub push OIDC identity | none (run.invoker granted on api + ml) |
| `github-deployer` | GitHub Actions via WIF | run.developer; `actAs` api-run/web-run/ml-run; artifactregistry.writer granted on the repo; impersonation itself comes from the `workloadIdentityUser` binding in `github-wif` |

Resource-scoped grants (secret accessor, bucket objectAdmin, topic publisher, Cloud Run
invoker, Artifact Registry writer) are created by the owning modules with these outputs.

Outputs: `emails`, `members`, `names`.
