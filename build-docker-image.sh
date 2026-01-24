#!/bin/bash
# Build the vibecraft-claude Docker image
# Run this from the project root directory

set -e

echo "Building vibecraft-claude Docker image..."
docker build -f Dockerfile.claude -t vibecraft-claude:latest .

echo ""
echo "✅ Image built successfully!"
echo ""
echo "To verify, run: docker images | grep vibecraft-claude"
echo ""
echo "To create a Docker network (if not exists):"
echo "  docker network create vibecraft-net"
echo ""
