#!/bin/bash
# Helper script for managing Vibecraft Docker containers with Claude workers
#
# Usage:
#   ./scripts/docker-claude.sh start    # Start the stack (production)
#   ./scripts/docker-claude.sh dev      # Start in dev mode (hot reload)
#   ./scripts/docker-claude.sh stop     # Stop the stack
#   ./scripts/docker-claude.sh claude 1 # Start Claude in worker 1
#   ./scripts/docker-claude.sh status   # Show status
#   ./scripts/docker-claude.sh logs     # Show hub logs
#   ./scripts/docker-claude.sh shell 1  # Shell into worker 1

set -e
cd "$(dirname "$0")/.."

# Default to multi compose, use dev for development
COMPOSE_FILE="docker-compose.multi.yml"
DEV_COMPOSE_FILE="docker-compose.dev.yml"

case "${1:-help}" in
  start)
    WORKERS="${2:-2}"
    echo "Starting Vibecraft with $WORKERS Claude workers..."
    docker-compose -f "$COMPOSE_FILE" up -d --scale claude-worker="$WORKERS"
    echo ""
    echo "✅ Stack started!"
    echo "   UI: http://localhost:4003"
    echo "   Start Claude: $0 claude 1"
    ;;

  dev)
    WORKERS="${2:-1}"
    echo "Starting Vibecraft in DEV mode with hot reload..."
    docker-compose -f "$DEV_COMPOSE_FILE" build
    docker-compose -f "$DEV_COMPOSE_FILE" up -d --scale claude-worker="$WORKERS"
    echo ""
    echo "✅ Dev stack started with hot reload!"
    echo "   UI: http://localhost:4003"
    echo "   Vite: http://localhost:4002"
    echo "   Logs: $0 dev-logs"
    echo "   Start Claude: docker exec -it vibecraft-dev-worker-1 tmux new-session -s claude 'claude --dangerously-skip-permissions'"
    ;;

  dev-logs)
    docker-compose -f "$DEV_COMPOSE_FILE" logs -f vibecraft-hub
    ;;

  dev-stop)
    echo "Stopping dev stack..."
    docker-compose -f "$DEV_COMPOSE_FILE" down
    ;;

  stop)
    echo "Stopping Vibecraft..."
    docker-compose -f "$COMPOSE_FILE" down
    ;;

  restart)
    echo "Restarting Vibecraft..."
    docker-compose -f "$COMPOSE_FILE" restart
    ;;

  claude)
    WORKER="${2:-1}"
    echo "Starting Claude in worker $WORKER..."
    echo "(Use Ctrl+C to exit)"
    echo ""
    docker exec -it "vibecraft-ui_claude-worker_$WORKER" claude --dangerously-skip-permissions
    ;;

  status)
    echo "Container Status:"
    docker ps -a --filter "name=vibecraft" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "Health Check:"
    curl -s http://localhost:4003/health | jq . 2>/dev/null || echo "Hub not responding"
    ;;

  logs)
    docker logs -f vibecraft-hub
    ;;

  shell)
    WORKER="${2:-1}"
    echo "Opening shell in worker $WORKER..."
    docker exec -it "vibecraft-ui_claude-worker_$WORKER" sh
    ;;

  build)
    echo "Rebuilding images..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    ;;

  clean)
    echo "Cleaning up containers and volumes..."
    docker-compose -f "$COMPOSE_FILE" down -v
    ;;

  *)
    echo "Vibecraft Docker Management"
    echo ""
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Commands:"
    echo "  start [N]    Start stack with N workers (default: 2)"
    echo "  dev [N]      Start in dev mode with hot reload"
    echo "  dev-logs     Follow dev hub logs"
    echo "  dev-stop     Stop dev stack"
    echo "  stop         Stop all containers"
    echo "  restart      Restart all containers"
    echo "  claude [N]   Start Claude session in worker N (default: 1)"
    echo "  status       Show container status and health"
    echo "  logs         Follow hub logs"
    echo "  shell [N]    Open shell in worker N"
    echo "  build        Rebuild Docker images"
    echo "  clean        Stop and remove volumes"
    echo ""
    echo "Examples:"
    echo "  $0 start 3      # Start with 3 Claude workers"
    echo "  $0 dev          # Start in dev mode with hot reload"
    echo "  $0 claude 2     # Run Claude in worker 2"
    ;;
esac
