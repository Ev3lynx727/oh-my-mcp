# Hot Reload

Guide to configuration hot reload in oh-my-mcp.

## Overview

oh-my-mcp watches the configuration file for changes and automatically reloads when modified. This allows you to add or modify servers without restarting the entire application.

## How It Works

1. File watcher monitors `config.yaml`
2. On file change, configuration is reloaded
3. New servers (not previously running) are automatically started
4. Existing servers continue running

## Triggering Hot Reload

Simply edit the config file:

```bash
# Edit config
vim config.yaml

# Or use inotifywait (Linux)
inotifywait -m config.yaml -e modify
```

## What Happens on Reload

### New Servers Added

If you add a new server to config:

```yaml
# Before
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]

# After (added fetch)
servers:
  memory:
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"]
  fetch:
    command: ["uvx", "mcp-server-fetch"]
```

The new `fetch` server will automatically start!

### Existing Servers

Existing servers **continue running** - they are not restarted.

To apply changes to existing servers, restart oh-my-mcp:

```bash
# Stop
pkill -f oh-my-mcp

# Start
npm run dev
```

### Servers Removed from Config

Running servers **continue running** even if removed from config. Stop them manually:

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8080/servers/server-name/stop
```

## Limitations

Hot reload:
- ✅ Adds new servers
- ✅ Changes to environment variables (for new servers)
- ❌ Does not restart existing servers
- ❌ Does not update running server configurations

## File Watcher Details

- Uses Node.js `fs.watchFile`
- Polls every 1 second
- Debounced to prevent multiple reloads

## Manually Reload Configuration

To trigger a manual reload, touch the config file:

```bash
touch config.yaml
```

Or restart the service:

```bash
# If running with systemd
sudo systemctl restart oh-my-mcp
```

## Best Practices

### For Development

Hot reload is great for development:
- Add new servers quickly
- Test configurations
- No downtime

### For Production

In production, consider:
- Test config changes in development first
- Use rolling restarts for existing servers
- Monitor logs during changes

## Debugging

Enable debug logging to see reload events:

```yaml
logLevel: debug
```

You'll see messages like:
```
{"level":30,"msg":"Config file changed, reloading..."}
{"level":30,"msg":"Auto-starting server: fetch"}
{"level":30,"msg":"Config hot-reloaded"}
```

## Troubleshooting

### Reload Not Working

1. **Check config file path**
   - Default is `./config.yaml`
   - Pass explicit path: `node dist/index.js /path/to/config.yaml`

2. **Check YAML is valid**
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"
   ```

3. **Check file permissions**
   ```bash
   ls -la config.yaml
   ```

### Multiple Reloads

If you see rapid reloading, the file watcher might be triggered by:
- Auto-save in editors
- Backup software
- File indexing

Solution: Edit in a separate file and copy when done:
```bash
# Edit
vim config.new.yaml

# Test
node dist/index.js config.new.yaml

# Deploy
mv config.new.yaml config.yaml
```
