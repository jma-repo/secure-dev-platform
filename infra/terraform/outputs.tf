# 仅定义输出示例；init/validate 不会创建状态，也不会实际运行这些输出。
# 默认示例：Node 22.22.2、127.0.0.1:4173、容器 HOST=0.0.0.0、无公共访问。
output "development_contract_example" {
  description = "本地开发契约；不是云资源清单，也不证明云平台安全规则覆盖。"
  value       = local.development_contract
}

output "container_environment_example" {
  description = "容器内的环境变量示例，宿主发布地址仍须限制为 127.0.0.1。"
  value = {
    HOST = var.container_host
    PORT = tostring(var.port)
  }
}

output "local_environment_example" {
  description = "本机服务默认环境变量示例。"
  value = {
    HOST = var.local_host
    PORT = tostring(var.port)
  }
}
