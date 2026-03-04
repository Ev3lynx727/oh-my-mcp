# Authentication

Guide to securing oh-my-mcp with authentication.

## Overview

oh-my-mcp uses Bearer token authentication to protect all endpoints except `/health` and `/`.

## Configuration

### Single Token

```yaml
auth:
  token: "your-secret-token"
```

### Multiple Tokens

```yaml
auth:
  tokens:
    - "token-1"
    - "token-2"
    - "token-3"
```

## Using Authentication

Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer your-secret-token" http://localhost:8080/servers
```

## Token Security

### Generate a Secure Token

```bash
# Using openssl
openssl rand -hex 32

# Using python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Token Best Practices

1. **Use long, random tokens** - At least 32 characters
2. **Don't commit tokens** - Use environment variables
3. **Rotate regularly** - Change tokens periodically
4. **Use different tokens** - For different clients if needed

## Environment Variables for Tokens

Store tokens in environment variables, not in config:

```yaml
auth:
  token: "{env:OH_MY_MCP_TOKEN}"
```

Set before starting:
```bash
export OH_MY_MCP_TOKEN=$(openssl rand -hex 32)
npm run dev
```

## Production Security

### Firewall

Only allow access from trusted IPs:

```bash
# UFW example
sudo ufw allow from 192.168.1.0/24 to any port 8080
sudo ufw allow from 192.168.1.0/24 to any port 8090
```

### TLS/SSL

Put oh-my-mcp behind a reverse proxy with TLS:

```
Client → HTTPS → Nginx (TLS) → HTTP → oh-my-mcp
```

Nginx config example:
```nginx
server {
    listen 443 ssl;
    server_name mcp.example.com;
    
    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Rate Limiting

Add rate limiting in nginx:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
server {
    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:8080;
    }
}
```

## Disabling Authentication

For development only:

```yaml
auth:
  # No auth block = no authentication
```

**Warning**: Never disable authentication in production!
