# scripts/start-claude-bridge.ps1
param(
  [string]$Port = "3000",
  [string]$Cwd  = "$HOME\work"
)

if (-not $env:ANTHROPIC_API_KEY) { Write-Error "Set ANTHROPIC_API_KEY"; exit 2 }

# Prefer Git Bash for Bash tool; fallback to WSL otherwise
if (-not $env:SHELL -and (Test-Path "C:\Program Files\Git\bin\bash.exe")) {
  setx SHELL "C:\Program Files\Git\bin\bash.exe" | Out-Null
  $env:SHELL = "C:\Program Files\Git\bin\bash.exe"
}

$env:PORT = $Port
$env:CC_ALLOWED_TOOLS = "Bash,Read,Git"
$env:CC_DISALLOWED_TOOLS = ""
$env:CC_CWD = $Cwd

# Run without global installs
npx -y tsx .\src\server.ts