# Private networking for one environment:
#   * a custom-mode VPC
#   * a reserved range + Service Networking peering (Private Service Access) used by
#     Cloud SQL private IP (and Memorystore when the scale-up path enables it)
#   * optional: a /24 subnet for Cloud Run Direct VPC egress (Private Google Access on). This
#     is the low-cost path: instances get an IP from the subnet and reach Cloud SQL over the
#     peering without connector VMs (Cloud Run docs: Direct VPC egress needs a /26 or larger)
#   * optional: a /28 subnet + Serverless VPC Access connector (legacy path, billed as VMs)
#   * optional: Cloud NAT so services that route ALL_TRAFFIC through the VPC can still reach
#     the public internet (only needed with ALL_TRAFFIC egress, i.e. the ML path)

resource "google_compute_network" "this" {
  project                         = var.project_id
  name                            = var.network_name
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false
}

# Subnet for Cloud Run Direct VPC egress. Cloud Run reserves addresses in /28 blocks and uses
# about twice the instance count at steady state; a /24 leaves room for the scale-up path.
resource "google_compute_subnetwork" "direct_vpc" {
  count = var.direct_vpc_subnet_cidr == null ? 0 : 1

  project                  = var.project_id
  name                     = "${var.network_name}-run"
  region                   = var.region
  network                  = google_compute_network.this.id
  ip_cidr_range            = var.direct_vpc_subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.1
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_subnetwork" "connector" {
  count = var.enable_connector ? 1 : 0

  project                  = var.project_id
  name                     = "${var.network_name}-connector"
  region                   = var.region
  network                  = google_compute_network.this.id
  ip_cidr_range            = var.connector_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.1
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Private Service Access range shared by Cloud SQL and Memorystore.
resource "google_compute_global_address" "private_service_access" {
  project       = var.project_id
  name          = "${var.network_name}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_service_access_prefix_length
  network       = google_compute_network.this.id
}

resource "google_service_networking_connection" "private_service_access" {
  network                 = google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_access.name]
  deletion_policy         = "ABANDON"
}

resource "google_vpc_access_connector" "this" {
  count = var.enable_connector ? 1 : 0

  project       = var.project_id
  name          = var.connector_name
  region        = var.region
  machine_type  = var.connector_machine_type
  min_instances = var.connector_min_instances
  max_instances = var.connector_max_instances

  subnet {
    name       = google_compute_subnetwork.connector[0].name
    project_id = var.project_id
  }
}

resource "google_compute_router" "nat" {
  count = var.enable_cloud_nat ? 1 : 0

  project = var.project_id
  name    = "${var.network_name}-router"
  region  = var.region
  network = google_compute_network.this.id
}

resource "google_compute_router_nat" "nat" {
  count = var.enable_cloud_nat ? 1 : 0

  project                            = var.project_id
  name                               = "${var.network_name}-nat"
  region                             = var.region
  router                             = google_compute_router.nat[0].name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
