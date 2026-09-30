terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Partial backend configuration; reuse the prod state bucket with a dedicated prefix:
  #   terraform init -backend-config="bucket=<PROD_PROJECT_ID>-tfstate" -backend-config="prefix=cloudflare"
  backend "gcs" {
    prefix = "cloudflare"
  }
}

# Authentication: export CLOUDFLARE_API_TOKEN (preferred) or set var.cloudflare_api_token.
# Token permissions: Zone:Read, DNS:Edit, Zone Settings:Edit, Zone WAF:Edit, Cache Rules:Edit,
# Bot Management:Edit — scoped to the orenjitrade.com zone only.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
