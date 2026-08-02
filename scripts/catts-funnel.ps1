# Expose CATTS :59200 over Tailscale Funnel so catreader.gatrivi.com can stream/DL.
# Prereq: CATTS API running on 59200. Funnel must be enabled on the Tailscale account.

$ErrorActionPreference = 'Stop'
$port = 59200

Write-Host "Checking local CATTS :$port ..."
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:$port/books" -Headers @{ 'X-API-Key' = 'catts-local' } -TimeoutSec 3 -UseBasicParsing | Out-Null
} catch {
  Write-Host "CATTS not up on :$port - start api first, then re-run."
  exit 1
}

Write-Host "Starting Tailscale Funnel on :$port (background)..."
tailscale funnel --bg $port
Write-Host ""
Write-Host "Status:"
tailscale funnel status
Write-Host ""
Write-Host "Set Vercel env VITE_CATTS_URL to the https URL above, then redeploy."
