# Troubleshooting

Common issues and solutions for oh-my-mcp.

## Server Won't Start

### Symptoms
- Server stays in "starting" state
- Server goes to "error" state
- Timeout error in logs

### Solutions

1. **Check command is valid**
   ```bash
   # Test manually
   npx -y @modelcontextprotocol/server-memory
   ```

2. **Check environment variables**
   ```bash
   # Make sure required env vars are set
   export GITHUB_TOKEN=your_token
   npm run dev
   ```

3. **Check port availability**
   ```bash
   ss -tlnp | grep 8100
   # If port in use, change port in config
   ```

4. **Check logs**
   ```bash
   curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/server-name/logs
   ```

## Authentication Errors

### 401 Unauthorized

**Symptom**: `{"error":"Unauthorized"}`

**Solutions**:

1. **Check token is correct**
   ```bash
   # Verify token in config
   cat config.yaml | grep -A1 auth
   ```

2. **Check header format**
   ```bash
   # Correct format
   curl -H "Authorization: Bearer YOUR_TOKEN" ...
   ```

3. **Check for extra spaces**
   ```bash
   # Wrong: "Bearer  YOUR_TOKEN"
   # Correct: "Bearer YOUR_TOKEN"
   ```

## Port Already in Use

### Symptoms
- `Error: listen EADDRINUSE: address already in use`

### Solutions

1. **Find process using port**
   ```bash
   ss -tlnp | grep 8080
   # or
   lsof -i :8080
   ```

2. **Kill the process**
   ```bash
   kill -9 <PID>
   ```

3. **Or use different port**
   ```yaml
   managementPort: 8081
   gatewayPort: 8091
   ```

## Server Crashes Immediately

### Symptoms
- Server starts then immediately stops
- Server shows "error" status

### Solutions

1. **Check logs**
   ```bash
   curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/server-name/logs
   ```

2. **Test server manually**
   ```bash
   npx -y supergateway --stdio "npx -y @modelcontextprotocol/server-memory" --port 8300
   ```

3. **Check dependencies**
   ```bash
   npm install
   ```

## Gateway Timeout

### Symptoms
- MCP requests timeout
- `McpError: MCP error -32001: Request timed out`

### Solutions

1. **Check server is running**
   ```bash
   curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/server-name/health
   ```

2. **Check Accept header**
   ```bash
   # Must include text/event-stream
   curl -H "Accept: application/json, text/event-stream" ...
   ```

3. **Increase timeout**
   ```yaml
   servers:
     memory:
       timeout: 120000  # 2 minutes
   ```

## Configuration Not Loading

### Symptoms
- Config changes not applied
- Old servers still running

### Solutions

1. **Check config file path**
   ```bash
   # Default: ./config.yaml
   node dist/index.js /path/to/config.yaml
   ```

2. **Check YAML syntax**
   ```bash
   # Validate YAML
   python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"
   ```

3. **Restart oh-my-mcp**
   ```bash
   # Kill and restart
   pkill -f oh-my-mcp
   npm run dev
   ```

## High Memory Usage

### Solutions

1. **Limit concurrent servers**
   ```yaml
   # Don't start all servers at once
   # Set enabled: false for servers you don't need
   ```

2. **Monitor process**
   ```bash
   htop
   # or
   ps aux | grep node
   ```

## Cannot Connect to Gateway

### Symptoms
- `Cannot POST /mcp/mcp` error

### Solutions

1. **Check server is running**
   ```bash
   curl -H "Authorization: Bearer TOKEN" http://localhost:8080/servers
   ```

2. **Use correct URL**
   ```bash
   # Wrong: http://localhost:8090/mcp/mcp/memory
   # Correct: http://localhost:8090/mcp/memory
   ```

3. **Check Accept header**
   ```bash
   curl -H "Accept: application/json, text/event-stream" ...
   ```

## Getting Help

### Enable Debug Logging

```yaml
logLevel: debug
```

### Collect Information

When reporting issues, include:
- oh-my-mcp version
- Node.js version
- Config (sanitized)
- Logs from the server
- Steps to reproduce

### Check Versions

```bash
node --version
npm --version
cat package.json | grep version
```
