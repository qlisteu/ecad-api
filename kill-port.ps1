# Kill processes on port 4000
$processes = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
foreach ($process in $processes) {
    try {
        Stop-Process -Id $process.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "Killed process $($process.OwningProcess)"
    } catch {
        Write-Host "Process $($process.OwningProcess) already stopped"
    }
}
Write-Host "Port 4000 cleared"
