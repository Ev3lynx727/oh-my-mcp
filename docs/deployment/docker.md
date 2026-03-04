# Docker Deployment

This guide covers running oh-my-mcp in Docker.

## Prerequisites

- Docker (20.10+)
- Optional: Docker Compose (for multi-container setup)

---

## Single-Container Docker

Build the image:

```bash
docker build -t oh-my-mcp:latest .
```

### Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY config.yaml /app/config.yaml
# Optional: mount a config dir as volume instead

EXPOSE 8080 8090
ENV NODE_ENV=production
CMD ["node", "dist/index.js", "/app/config.yaml"]
```

### Run

```bash
docker run -d \
  -p 8080:8080 \
  -p 8090:8090 \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  --name oh-my-mcp \
  oh-my-mcp:latest
```

You can override the config path by changing the command argument.

---

## Docker Compose

Useful when you also want to run a reverse proxy (e.g., Nginx) or other services.

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  oh-my-mcp:
    build: .
    ports:
      - "8080:8080"   # management
      - "8090:8090"   # gateway
    volumes:
      - ./config.yaml:/app/config.yaml:ro
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080/health', (r)=>{if(r.statusCode!==200)process.exit(1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Start with `docker compose up -d`.

---

## Access

- Management UI (if you add one): http://localhost:8080
- Gateway endpoint (for clients): http://localhost:8090/mcp
- Metrics: http://localhost:8080/metrics
- Health: http://localhost:8080/health

---

## Logging

By default, logs go to stdout/stderr and are captured by Docker. You can mount a volume for log files if you configure pino file transport. Example:

`config.yaml` with pino transport (not built-in; configure separately in code) or use `docker logs` for collection.

---

## Configuration

Mount your own `config.yaml` into the container. For secrets (e.g., tokens), prefer environment variables:

```yaml
servers:
  my-server:
    command: ["npx", "-y", "@mcp/server"]
    env:
      API_KEY: "${MY_SERVER_API_KEY}"
```

Then run container with `-e MY_SERVER_API_KEY=...`.

---

## Security Considerations

- Do not expose ports 8080/8090 directly to the internet without authentication and TLS.
- Use a reverse proxy (Traefik, Nginx, Caddy) in front, enabling HTTPS and stricter auth.
- Limit host mounts: config and logs should be read-only or safely writable.
- Run as non-root user (the node:20-alpine image runs as node by default).

---

## Multi-arch Builds

For ARM (e.g., Raspberry Pi) and AMD64, use `docker buildx`:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t oh-my-mcp:multi .
```

---

## Updating

Pull new image and restart container:

```bash
docker pull oh-my-mcp:latest
docker stop oh-my-mcp && docker rm oh-my-mcp
docker run ... # as above
```

Or with compose: `docker compose pull && docker compose up -d`.

---

## Troubleshooting

- **Container exits immediately**: Check the command path and config file location. Verify file permissions.
- **Port already in use**: Ensure host ports 8080/8090 are free, or map to different host ports.
- **Supergateway not found**: Ensure `npx` can reach npm registry (network). For restricted environments, pre-download supergateway or run `npm install -g supergateway` in the image.
- **Logs not appearing**: Ensure `NODE_ENV` is not set to `silent` and your logger level includes info/debug.

For more, see `docs/troubleshooting.md`.
