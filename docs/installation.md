# Installation Guide

This guide covers how to install and set up oh-my-mcp.

## Prerequisites

- Node.js 18+
- npm or yarn
- npx (comes with npm)

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/oh-my-mcp.git
cd oh-my-mcp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Your Servers

Copy the example configuration and customize it:

```bash
cp config.example.yaml config.yaml
```

Edit `config.yaml` with your server configurations. See the [Configuration Guide](./configuration.md) for details.

### 4. Test the Setup

Start the server in development mode:

```bash
npm run dev
```

You should see output like:

```text
Loading config from: ./config.yaml
{"level":30,"time":...,"servers":["memory"],"msg":"Config loaded"}
{"level":30,"time":...,"managementPort":8080,"gatewayPort":8090,"servers":1,"msg":"Starting oh-my-mcp"}
{"level":30,"time":...,"port":8080,"msg":"Management API listening"}
{"level":30,"time":...,"port":8090,"msg":"Gateway API listening"}
```

### 5. Verify It's Working

Test the management API:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/servers
```

Test the health endpoint:

```bash
curl http://localhost:8080/health
```

## Build for Production

Build the TypeScript code:

```bash
npm run build
```

The compiled JavaScript will be in the `dist/` directory.

## Running in Production

### Using Node.js Directly

```bash
node dist/index.js /path/to/config.yaml
```

### Using PM2

```bash
pm2 start dist/index.js --name oh-my-mcp -- /path/to/config.yaml
pm2 save
```

### Using systemd

See the [Systemd Service Guide](./deployment-systemd.md) for production deployment with systemd.

## Next Steps

- Read the [Configuration Guide](./configuration.md) to customize your setup
- Read the [Quick Start Guide](./quickstart.md) for a quick overview
- Read the [API Reference](./api-reference.md) to understand the available endpoints
