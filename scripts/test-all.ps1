#!/usr/bin/env pwsh
# Usage: .\scripts\test-all.ps1

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Jungle Tools Automated Test Suite Runner " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Phase 1: Unit tests
Write-Host "`n[Phase 1] Running Backend Unit Tests (node:test)..." -ForegroundColor Yellow
npm test --prefix "$PSScriptRoot/../backend"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Unit tests failed!" -ForegroundColor Red
    exit 1
}

# Phase 2: Live Cloud E2E tests
Write-Host "`n[Phase 2] Running Live Cloud E2E Integration Tests..." -ForegroundColor Yellow
node "$PSScriptRoot/test-all.mjs"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Live E2E tests failed!" -ForegroundColor Red
    exit 1
}
