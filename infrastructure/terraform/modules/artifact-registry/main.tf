# Docker repositories:
#   * `orenjitrade` (STANDARD): the api, web and ml images pushed by GitHub Actions through
#     Workload Identity Federation (github-deployer SA) and pulled by Cloud Run
#   * optional `dockerhub` (REMOTE, Docker Hub upstream): a pull-through cache so third-party
#     images (the Valkey/Redis sidecar) are pinned by digest and pulled from Artifact Registry,
#     never from Docker Hub at deploy time
#
# Cleanup (standard repository): untagged manifests older than N days are deleted; tagged
# versions older than `tagged_retention_days` are deleted except the `keep_tagged_versions`
# most recent versions of each image and every `v*` release tag (KEEP policies win over
# DELETE policies). `cleanup_policy_dry_run = true` logs what would be deleted instead.

resource "google_artifact_registry_repository" "docker" {
  project       = var.project_id
  location      = var.region
  repository_id = var.repository_id
  description   = "OrenjiTrade container images (api, web, ml)"
  format        = "DOCKER"
  labels        = var.labels

  docker_config {
    immutable_tags = false # :latest and :sha tags move on every main build
  }

  cleanup_policy_dry_run = var.cleanup_policy_dry_run

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${var.untagged_retention_days * 86400}s"
    }
  }

  cleanup_policies {
    id     = "delete-old-tagged"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = "${var.tagged_retention_days * 86400}s"
    }
  }

  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"
    most_recent_versions {
      package_name_prefixes = var.keep_package_name_prefixes
      keep_count            = var.keep_tagged_versions
    }
  }

  cleanup_policies {
    id     = "keep-release-tags"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["v"]
    }
  }
}

resource "google_artifact_registry_repository" "dockerhub" {
  count = var.create_dockerhub_remote ? 1 : 0

  project       = var.project_id
  location      = var.region
  repository_id = var.dockerhub_repository_id
  description   = "Pull-through cache of Docker Hub (sidecar images pinned by digest)"
  format        = "DOCKER"
  mode          = "REMOTE_REPOSITORY"
  labels        = var.labels

  remote_repository_config {
    description = "Docker Hub"

    docker_repository {
      public_repository = "DOCKER_HUB"
    }

    # Optional Docker Hub credentials (higher anonymous pull limits). The password lives in
    # Secret Manager; the Artifact Registry service agent needs secretAccessor on it.
    dynamic "upstream_credentials" {
      for_each = var.dockerhub_upstream_credentials == null ? [] : [var.dockerhub_upstream_credentials]
      content {
        username_password_credentials {
          username                = upstream_credentials.value.username
          password_secret_version = upstream_credentials.value.password_secret_version
        }
      }
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "writers" {
  for_each = toset(var.writer_members)

  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = each.value
}

resource "google_artifact_registry_repository_iam_member" "readers" {
  for_each = toset(var.reader_members)

  project    = var.project_id
  location   = google_artifact_registry_repository.docker.location
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.reader"
  member     = each.value
}

resource "google_artifact_registry_repository_iam_member" "dockerhub_readers" {
  for_each = var.create_dockerhub_remote ? toset(var.reader_members) : toset([])

  project    = var.project_id
  location   = google_artifact_registry_repository.dockerhub[0].location
  repository = google_artifact_registry_repository.dockerhub[0].name
  role       = "roles/artifactregistry.reader"
  member     = each.value
}
