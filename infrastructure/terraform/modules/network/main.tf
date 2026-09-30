# Private networking for one environment:
#   * a custom-mode VPC
#   * a /28 subnet dedicated to the Serverless VPC Access connector (Private Google Access on)
#   * a reserved range + Service Networking peering (Private Service Access) used by
#     Cloud SQL private IP and Memorystore
#   * the Serverless VPC Access connector that Cloud Run services attach to
#   * optional Cloud NAT so services that route ALL_TRAFFIC through the VPC can still
#     reach the public internet (Stripe, Firebase REST endpoints, card providers)

resource "google_compute_network" "this" {
  project                         = var.project_id
  name                            = var.network_name
  auto_create_subnetworks         = false
  routing_mode                    = "REGIONAL"
  delete_default_routes_on_create = false
}

resource "google_compute_subnetwork" "connector" {
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
  project       = var.project_id
  name          = var.connector_name
  region        = var.region
  machine_type  = var.connector_machine_type
  min_instances = var.connector_min_instances
  max_instances = var.connector_max_instances

  subnet {
    name       = google_compute_subnetwork.connector.name
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
