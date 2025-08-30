param(
  [string]$Server = $env:VIBE_SERVER,
  [string]$Token = $env:WORKER_TOKEN
)

if (-not $Server) { $Server = Read-Host "VIBE_SERVER (например https://vibe-coding-agent.onrender.com)" }
if (-not $Token) { $Token = Read-Host "WORKER_TOKEN (секрет с Render)" }

$env:VIBE_SERVER = $Server
$env:WORKER_TOKEN = $Token

Write-Host "Server: $Server"
Write-Host "Token: $Token.Substring(0, [Math]::Min(6,$Token.Length))***"

# Запускаем воркер
python worker\local_worker_windows.py
