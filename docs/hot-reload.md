# Hot Reload Configuration

Guide to configuration hot reload in oh-my-mcp.

## Overview

oh-my-mcp watches the configuration file for changes and automatically reloads when modified. The system supports smart config diff detection, graceful rolling restarts, and validation with automatic rollback.

## How It Works

1. **File Watcher**: Monitors `config.yaml` using [chokidar](https://github.com/paulmillr/chokidar) for cross-platform reliability.
2. **Debouncing**: A 500ms delay prevents "reload storms" during rapid saves.
3. **Validation**: Uses Zod schemas to ensure the new configuration is valid before applying.
4. **Smart Diff**: Detects exactly which servers were added, removed, or modified.
5. **Graceful Restart**: Only restarts servers affected by critical configuration changes (e.g., `command`, `env`, `port`).

## Configuration Options

```yaml
hotReload:
  enabled: true                    # Enable/disable hot reload
  debounceMs: 500                 # Debounce delay (ms)
  awaitWriteFinishMs: 300         # Wait for file writes to settle
  usePolling: false              # Use polling instead of native events
  
  # Reload strategy
  strategy: "graceful"           # immediate | graceful | rolling
  staggerDelay: 1000              # Delay between server restarts (ms)
  maxConcurrent: 2               # Max concurrent restarts (rolling)
  
  # Validation
  validateBeforeApply: true      # Validate before applying
  rollbackOnError: true          # Rollback on validation failure
```

## Strategies

### immediate

All operations run in parallel without delay. Fastest but may cause brief service disruption.

### graceful (default)

Sequential operations with stagger delay between each server restart. Recommended for production.

### rolling

Batch processing with `maxConcurrent` limit. Best for maintaining availability when managing a large number of servers.

## Implementation Details

### Smart Diff Detection

The system calculates a diff between the old and new configuration to minimize disruption.

**Critical changes (Requires restart):**

- `command`: The executable or arguments changed.
- `env`: Environment variables modified.
- `port`: Listening port changed.
- `transport`: Transport type changed.

**Non-critical changes (Updated live):**

- `timeout`: Request/response timeout settings.
- `enabled`: Enable/disable flag (if disabled, server is stopped; if enabled, it is started).
- `healthCheck`: Health check intervals or paths.

### Validation & Rollback

Before applying a new configuration, the system validates:

- **YAML Syntax**: Proper structure and indentation.
- **Port Range**: Valid ports (1-65535).
- **Zod Schema**: Full compliance with the expected configuration structure.

If validation fails, the system logs the error and **rolls back** to the last known valid configuration, ensuring the service remains stable.

## Best Practices

### Development

- Keep hot reload enabled to quickly test new server configurations without manual restarts.

### Production

- Use the `graceful` strategy.
- Always keep `validateBeforeApply: true` to prevent accidental downtime from malformed config files.
- Monitor logs (log level `debug` or `info`) during configuration updates.

## Troubleshooting

### Reload Not Triggering

1. **Check Path**: Ensure you are editing the configuration file passed to the application.
2. **Permissions**: Verify the application has read access to the file.
3. **Polling**: On some networked filesystems (like NFS or certain Docker setups), you may need to set `usePolling: true`.

### Rapid Reloading

If you see multiple reloads for a single save, increase `debounceMs` to `1000`.

## API Control

You can also manage servers manually via the Management API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /servers | List all servers and their current config |
| POST | /servers/:id/restart | Manually restart a specific server |
| POST | /servers/_stop-all | Stop all servers |
| POST | /servers/_start-all | Start all configured servers |
