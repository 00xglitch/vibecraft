# Docker Setup for Vibecraft

This guide explains how to set up Docker container sessions for Vibecraft.

## Prerequisites

- Docker Desktop installed and running
- WSL 2 integration enabled (for Windows users)
- ANTHROPIC_API_KEY environment variable set

## Quick Start

### 1. Build the Docker Image

From your **Windows PowerShell/CMD** (or WSL terminal with Docker access):

```bash
cd /path/to/vibecraft-ui
docker build -f Dockerfile.claude -t vibecraft-claude:latest .
```

Or use the build script:

```bash
bash build-docker-image.sh
```

### 2. Create Docker Network

```bash
docker network create vibecraft-net
```

### 3. Create a Shared Volume (Optional)

For persistent data across containers:

```bash
docker volume create vibecraft-shared
```

### 4. Verify Setup

```bash
# Check image exists
docker images | grep vibecraft-claude

# Check network exists
docker network ls | grep vibecraft-net

# Check volume exists
docker volume ls | grep vibecraft-shared
```

## Using Docker Sessions

### From Vibecraft UI

1. Click "New Zone" or press `Alt+N`
2. Select **"Docker Container 🐳"** runtime
3. Choose memory limit (512M - 4GB)
4. Set directory and name
5. Click "Create"

### What Happens

- Docker container created with name `vibecraft-session-{id}`
- Workspace directory mounted at `/workspace`
- Claude CLI runs inside tmux in the container
- Session-specific settings mounted at `/root/.vibecraft/sessions/{id}`
- Container connected to `vibecraft-net` network

## Features

### Isolated Sessions

- Each session runs in its own container
- No conflicts between sessions
- Per-session MCP/plugin configuration

### Resource Limits

- Configure memory limits per container
- Prevents resource exhaustion
- Default: 1GB (configurable: 512M-4GB)

### Persistent Settings

- Session-specific settings at `~/.vibecraft/sessions/{id}/settings.json`
- Mounted read-only into containers
- MCPs/plugins configured per-zone

### Prompts & Control

- Send prompts via UI (works through docker exec)
- Cancel with Ctrl+C (🚫 button)
- View logs: `docker logs vibecraft-session-{id}`

## Troubleshooting

### "No such image: vibecraft-claude:latest"

Build the image first:

```bash
docker build -f Dockerfile.claude -t vibecraft-claude:latest .
```

### "network vibecraft-net not found"

Create the network:

```bash
docker network create vibecraft-net
```

### "Cannot connect to Docker daemon"

Ensure Docker Desktop is running and WSL integration is enabled:

1. Open Docker Desktop
2. Settings → Resources → WSL Integration
3. Enable integration for your WSL distro
4. Restart Docker Desktop

### Container won't start

Check Docker Desktop logs:

```bash
docker logs vibecraft-session-{id}
```

Check if port 4003 is accessible from container:

```bash
docker exec vibecraft-session-{id} ping vibecraft-hub
```

### Permission denied on workspace

Make sure the workspace path is accessible from Docker:

- Windows: Share the drive in Docker Desktop settings
- WSL: Use WSL paths (`/home/...`) not Windows paths (`/mnt/c/...`)

## Manual Container Management

### List all Vibecraft containers

```bash
docker ps -a --filter "name=vibecraft-session"
```

### Stop all Vibecraft containers

```bash
docker ps -q --filter "name=vibecraft-session" | xargs docker stop
```

### Remove all Vibecraft containers

```bash
docker ps -aq --filter "name=vibecraft-session" | xargs docker rm -f
```

### View container logs

```bash
docker logs vibecraft-session-{id}
```

### Execute commands inside container

```bash
docker exec -it vibecraft-session-{id} bash
```

### View container stats (CPU, memory)

```bash
docker stats vibecraft-session-{id}
```

## Cleanup

### Remove stopped containers

```bash
docker container prune
```

### Remove the image

```bash
docker rmi vibecraft-claude:latest
```

### Remove the network

```bash
docker network rm vibecraft-net
```

### Remove the volume

```bash
docker volume rm vibecraft-shared
```

## Advanced Configuration

### Custom Network

Use a different network name:

```typescript
// In session creation
docker: {
  workspace: '/path/to/workspace',
  memory: '2G',
  network: 'my-custom-network'  // Custom network
}
```

### Custom Memory Limits

Available options: `512M`, `1G`, `2G`, `4G`

Or set custom limit in the UI memory dropdown.

### Environment Variables

Containers receive:

- `ANTHROPIC_API_KEY` - Your Claude API key
- `SESSION_ID` - Unique session identifier
- `SESSION_NAME` - Human-readable session name
- `SESSION_SETTINGS_PATH` - Path to session settings
- `VIBECRAFT_DATA_DIR` - Data directory
- `VIBECRAFT_WS_NOTIFY` - WebSocket notification URL

## Architecture

```
┌──────────────────────────────────────────────┐
│  Docker Network: vibecraft-net               │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ vibecraft-session-abc123               │ │
│  │ ┌────────────────────────────────────┐ │ │
│  │ │ tmux: vibecraft-xyz                │ │ │
│  │ │   └─ claude --settings ...         │ │ │
│  │ └────────────────────────────────────┘ │ │
│  │ Mounts:                                │ │
│  │   - /workspace (your code)             │ │
│  │   - ~/.vibecraft/sessions/{id}         │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ vibecraft-hub (server)                 │ │
│  │   localhost:4003                       │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## See Also

- [Main README](README.md) - General Vibecraft documentation
- [CLAUDE.md](CLAUDE.md) - Technical documentation
- [Dockerfile.claude](Dockerfile.claude) - Image definition
