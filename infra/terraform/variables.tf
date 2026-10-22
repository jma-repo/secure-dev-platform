variable "node_version" {
  description = "本机、开发容器、运行镜像和 CI 使用相同的固定 Node 版本。"
  type        = string
  default     = "22.22.2"
  nullable    = false

  validation {
    condition     = var.node_version == "22.22.2"
    error_message = "此 PoC 只允许 Node 22.22.2。"
  }
}

variable "local_host" {
  description = "本机服务默认 HOST，同时也是 Compose 的宿主发布地址。"
  type        = string
  default     = "127.0.0.1"
  nullable    = false

  validation {
    condition     = var.local_host == "127.0.0.1"
    error_message = "宿主端口只能绑定 127.0.0.1，不允许公共监听。"
  }
}

variable "container_host" {
  description = "容器内服务 HOST；不等于向公网发布端口。"
  type        = string
  default     = "0.0.0.0"
  nullable    = false

  validation {
    condition     = var.container_host == "0.0.0.0"
    error_message = "容器内服务必须监听 0.0.0.0，以便本机转发访问。"
  }
}

variable "port" {
  description = "非特权服务端口；默认与容器和本机配置一致。"
  type        = number
  default     = 4173
  nullable    = false

  validation {
    condition     = var.port == floor(var.port) && var.port >= 1024 && var.port <= 65535
    error_message = "端口必须是 1024 到 65535 之间的整数。"
  }
}

variable "public_access" {
  description = "契约不允许公共端口；这不是外部平台的端口可见性策略。"
  type        = bool
  default     = false
  nullable    = false

  validation {
    condition     = var.public_access == false
    error_message = "本地 PoC 必须禁用公共访问。"
  }
}

variable "cpu_limit" {
  description = "Compose CPU 上限的契约示例，不创建计算资源。"
  type        = number
  default     = 0.5
  nullable    = false

  validation {
    condition     = var.cpu_limit >= 0.1 && var.cpu_limit <= 2
    error_message = "本地 PoC 的 CPU 上限必须在 0.1 到 2 之间。"
  }
}

variable "memory_limit_mb" {
  description = "Compose 内存上限（MiB）的契约示例。"
  type        = number
  default     = 256
  nullable    = false

  validation {
    condition     = var.memory_limit_mb == floor(var.memory_limit_mb) && var.memory_limit_mb >= 128 && var.memory_limit_mb <= 1024
    error_message = "内存上限必须是 128 到 1024 MiB 之间的整数。"
  }
}

variable "pids_limit" {
  description = "Compose 进程数量上限的契约示例。"
  type        = number
  default     = 64
  nullable    = false

  validation {
    condition     = var.pids_limit == floor(var.pids_limit) && var.pids_limit >= 16 && var.pids_limit <= 256
    error_message = "进程数量上限必须是 16 到 256 之间的整数。"
  }
}
