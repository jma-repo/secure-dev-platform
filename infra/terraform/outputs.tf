# Output examples only. init/validate does not create state and does not actually run these outputs.
# Default example: Node 22.22.2, 127.0.0.1:4173, container HOST=0.0.0.0, no public access.
output "development_contract_example" {
  description = "Local development contract. It is not a cloud resource inventory and does not prove cloud security rule coverage."
  value       = local.development_contract
}

output "container_environment_example" {
  description = "Example environment variables inside the container. The host publish address must still be limited to 127.0.0.1."
  value = {
    HOST = var.container_host
    PORT = tostring(var.port)
  }
}

output "local_environment_example" {
  description = "Example default environment variables for the local service."
  value = {
    HOST = var.local_host
    PORT = tostring(var.port)
  }
}
