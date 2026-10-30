variable "node_version" {
  description = "The local machine, dev container, runtime image, and CI all use the same pinned Node version."
  type        = string
  default     = "22.22.2"
  nullable    = false

  validation {
    condition     = var.node_version == "22.22.2"
    error_message = "This PoC only allows Node 22.22.2."
  }
}

variable "local_host" {
  description = "Default HOST for the local service. It is also the host publish address for Compose."
  type        = string
  default     = "127.0.0.1"
  nullable    = false

  validation {
    condition     = var.local_host == "127.0.0.1"
    error_message = "The host port may only bind to 127.0.0.1. Public listening is not allowed."
  }
}

variable "container_host" {
  description = "Service HOST inside the container. This does not mean publishing the port to the public internet."
  type        = string
  default     = "0.0.0.0"
  nullable    = false

  validation {
    condition     = var.container_host == "0.0.0.0"
    error_message = "The service inside the container must listen on 0.0.0.0 so that local forwarding can reach it."
  }
}

variable "port" {
  description = "Unprivileged service port. By default it matches the container and local configuration."
  type        = number
  default     = 4173
  nullable    = false

  validation {
    condition     = var.port == floor(var.port) && var.port >= 1024 && var.port <= 65535
    error_message = "The port must be an integer between 1024 and 65535."
  }
}

variable "public_access" {
  description = "The contract does not allow public ports. This is not an external platform's port visibility policy."
  type        = bool
  default     = false
  nullable    = false

  validation {
    condition     = var.public_access == false
    error_message = "The local PoC must disable public access."
  }
}

variable "cpu_limit" {
  description = "Contract example for the Compose CPU limit. It does not create compute resources."
  type        = number
  default     = 0.5
  nullable    = false

  validation {
    condition     = var.cpu_limit >= 0.1 && var.cpu_limit <= 2
    error_message = "The CPU limit for the local PoC must be between 0.1 and 2."
  }
}

variable "memory_limit_mb" {
  description = "Contract example for the Compose memory limit (MiB)."
  type        = number
  default     = 256
  nullable    = false

  validation {
    condition     = var.memory_limit_mb == floor(var.memory_limit_mb) && var.memory_limit_mb >= 128 && var.memory_limit_mb <= 1024
    error_message = "The memory limit must be an integer between 128 and 1024 MiB."
  }
}

variable "pids_limit" {
  description = "Contract example for the Compose process count limit."
  type        = number
  default     = 64
  nullable    = false

  validation {
    condition     = var.pids_limit == floor(var.pids_limit) && var.pids_limit >= 16 && var.pids_limit <= 256
    error_message = "The process count limit must be an integer between 16 and 256."
  }
}
