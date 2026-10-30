terraform {
  required_version = "=1.16.6"
}

# Uses only Terraform's built-in terraform_data: no external provider, no backend block, and no cloud resources.
# Without a backend block, Terraform uses local state by default. This PoC does not run plan or apply.
# This is a verifiable development contract example. It does not generate or automatically sync Docker / Compose configuration.
# If no Trivy rule matches terraform_data, zero findings do not mean cloud resource IaC is covered.
locals {
  development_contract = {
    node_version    = var.node_version
    start_command   = "node apps/sample-service/server.mjs"
    health_path     = "/healthz"
    local_endpoint  = "http://${var.local_host}:${var.port}"
    local_host      = var.local_host
    container_host  = var.container_host
    port            = var.port
    public_access   = var.public_access
    read_only       = true
    cap_drop        = ["ALL"]
    no_new_privs    = true
    cpu_limit       = var.cpu_limit
    memory_limit_mb = var.memory_limit_mb
    pids_limit      = var.pids_limit
  }
}

resource "terraform_data" "development_contract" {
  input = local.development_contract
}
