# oh-my-mcp Documentation

Welcome to the oh-my-mcp documentation. This documentation provides comprehensive information about installing, configuring, and using oh-my-mcp.

## Table of Contents

### Getting Started

- [Installation Guide](./installation.md) - How to install and set up oh-my-mcp
- [Quick Start Guide](./quickstart.md) - Get up and running in 5 minutes
- [Configuration Guide](./configuration.md) - Detailed configuration options

### Core Concepts

- [Architecture](./architecture.md) - System design and architecture
- [Server Management](./server-management.md) - Managing MCP servers
- [Authentication](./authentication.md) - Security and authentication
- [API Reference](./api-reference.md) - Complete API documentation

### Deployment

- [Systemd Service](./deployment-systemd.md) - Running as a systemd service
- [Production Deployment](./deployment-production.md) - Production best practices

### Advanced Topics

- [Hot Reload](./hot-reload.md) - Configuration hot reload
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

---

## What is oh-my-mcp?

oh-my-mcp is a native MCP gateway that provides a management layer on top of supergateway. It enables you to:

- **Manage multiple MCP servers** - Start, stop, restart, and monitor multiple MCP servers from a single interface
- **Unified endpoint** - Access all your MCP servers through a single gateway endpoint
- **Process lifecycle management** - Automatic startup, health checks, and restart on failure
- **Hot configuration reload** - Update server configurations without restarting
- **Authentication** - Secure your MCP servers with bearer token authentication

## Features

### Server Management

- Automatic server startup on configuration load
- Health monitoring and status checks
- Automatic restart on process failure
- Log streaming for debugging

### Gateway

- Single unified endpoint for all MCP servers
- Route by server ID in URL path
- Support for all MCP transport protocols

### Security

- Bearer token authentication
- Per-request server isolation
- Environment variable secrets

## Quick Links

- [GitHub Repository](https://github.com/your-org/oh-my-mcp)
- [Issue Tracker](https://github.com/your-org/oh-my-mcp/issues)
- [Changelog](./changelog.md)
