# Deploy Task 1 (perf-ui) and Task 2 (task2-site) to Vercel
#
# Prerequisites:
#   1. Vercel account: https://vercel.com
#   2. One-time login: npx vercel login
#
# Usage (from repo root):
#   powershell -File scripts/deploy-vercel.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "=== Building Task 1 (perf-ui) ===" -ForegroundColor Cyan
Push-Location "$Root\perf-ui"
npm run build
Write-Host "Deploying perf-ui..." -ForegroundColor Cyan
$task1Url = (npx vercel --prod --yes 2>&1 | Select-String -Pattern 'https://[^\s]+' | Select-Object -Last 1).ToString().Trim()
Pop-Location

Write-Host "=== Deploying Task 2 (task2-site) ===" -ForegroundColor Cyan
Push-Location "$Root\task2-site"
if ($task1Url) {
  $task1Param = "?task1=$([uri]::EscapeDataString($task1Url))"
} else {
  $task1Param = ""
}
$task2Url = (npx vercel --prod --yes 2>&1 | Select-String -Pattern 'https://[^\s]+' | Select-Object -Last 1).ToString().Trim()
Pop-Location

Write-Host ""
Write-Host "Task 1 Live URL: $task1Url" -ForegroundColor Green
Write-Host "Task 2 Docs URL: $task2Url" -ForegroundColor Green
Write-Host ""
Write-Host "Update README.md with the Task 1 URL, then commit and push."
