terraform {
  required_version = "=1.16.6"
}

# 仅使用 Terraform 内置 terraform_data：无外部 provider、无 backend 块、无云资源。
# 未声明 backend 时 Terraform 默认使用本地状态；本 PoC 不执行 plan/apply。
# 这里是可校验的开发契约示例，不会生成或自动同步 Docker / Compose 配置。
# Trivy 若没有匹配 terraform_data 的规则，零发现不代表云资源 IaC 已被覆盖。
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
