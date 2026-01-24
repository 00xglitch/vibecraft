# PowerShell script to build vibecraft-claude Docker image
# Run this from PowerShell in the project root directory

Write-Host "Building vibecraft-claude Docker image..." -ForegroundColor Cyan
docker build -f Dockerfile.claude -t vibecraft-claude:latest .

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Image built successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To verify, run:" -ForegroundColor Yellow
    Write-Host "  docker images | Select-String vibecraft-claude" -ForegroundColor White
    Write-Host ""
    Write-Host "To create a Docker network (if not exists):" -ForegroundColor Yellow
    Write-Host "  docker network create vibecraft-net" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Build failed!" -ForegroundColor Red
    Write-Host "Check the error messages above." -ForegroundColor Red
    Write-Host ""
    exit 1
}
