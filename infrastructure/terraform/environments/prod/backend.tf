terraform {
  # Partial backend configuration: the state bucket is created out-of-band (see
  # infrastructure/terraform/README.md) and supplied at init time so no bucket name is
  # committed and CI/operators can point at their own project:
  #
  #   terraform init \
  #     -backend-config="bucket=<PROJECT_ID>-tfstate" \
  #     -backend-config="prefix=environments/prod"
  #
  # `terraform init -backend=false` (used by CI validate) ignores this block entirely.
  backend "gcs" {
    prefix = "environments/prod"
  }
}
