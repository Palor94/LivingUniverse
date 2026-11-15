param([switch]$Apply)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$node=(Get-Command node -ErrorAction Stop).Source
$runner=Join-Path $PSScriptRoot 'run-hidden.vbs'
$hostProgram=Join-Path $env:SystemRoot 'System32\wscript.exe'
if(-not(Test-Path -LiteralPath $runner -PathType Leaf) -or -not(Test-Path -LiteralPath $hostProgram -PathType Leaf)){throw 'Hidden startup runner unavailable.'}
$targets=@(
    @{Name='Living Universe catalogue runtime';Script='app\start-existing.mjs'},
    @{Name='Living Universe Grok Gateway';Script='mcp\grok-task-runner.mjs'},
    @{Name='Living Universe Private MCP Tunnel';Script='mcp\task-runner.mjs'}
)
$plan=@($targets | ForEach-Object {
    $script=Join-Path $repo $_.Script
    if(-not(Test-Path -LiteralPath $script -PathType Leaf)){throw "Launcher missing: $script"}
    $task=Get-ScheduledTask -TaskName $_.Name -ErrorAction Stop
    if($task.Actions.Count -ne 1){throw "Inspect multiple actions before repairing $($_.Name)."}
    if($Apply -and $task.State -eq 'Running'){throw "Stop the running task before repairing $($_.Name)."}
    [pscustomobject]@{Name=$_.Name;Execute=$hostProgram;Arguments=('"'+$runner+'" "'+$node+'" "'+$script+'" "'+$repo+'"');WorkingDirectory=$repo;Previous=$task.Actions[0]}
})
if(-not $Apply){$plan | Select-Object Name,Execute,Arguments,WorkingDirectory | ConvertTo-Json -Depth 4;exit}

# Preserve every task's trigger, principal, settings and ACL; change its action only.
$stamp=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss-fffZ')
$backup=Join-Path $env:LOCALAPPDATA ('LivingUniverse\maintenance\'+$stamp+'-startup-actions')
New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $backup /inheritance:r /grant:r ($user+':(OI)(CI)F') 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect startup backup.'}
foreach($item in $plan){Export-ScheduledTask -TaskName $item.Name | Set-Content -LiteralPath (Join-Path $backup ($item.Name+'.xml')) -Encoding utf8}
$changed=@()
try {
    foreach($item in $plan){
        $action=New-ScheduledTaskAction -Execute $item.Execute -Argument $item.Arguments -WorkingDirectory $item.WorkingDirectory
        Set-ScheduledTask -TaskName $item.Name -Action $action -ErrorAction Stop | Out-Null
        $changed+=,$item
        $actual=(Get-ScheduledTask -TaskName $item.Name).Actions[0]
        if($actual.Execute -ne $item.Execute -or $actual.Arguments -ne $item.Arguments -or $actual.WorkingDirectory -ne $item.WorkingDirectory){throw "Task read-back did not match: $($item.Name)"}
    }
    @{status='applied';backup=$backup;tasks=@($plan | Select-Object Name,Execute,Arguments,WorkingDirectory)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'result.json') -Encoding utf8
    Write-Output ('STARTUP_REPAIRED: '+$backup)
} catch {
    $failure=$_.Exception.Message
    foreach($item in $changed){
        try {Set-ScheduledTask -TaskName $item.Name -Action $item.Previous -ErrorAction Stop | Out-Null}
        catch {Write-Error ('ROLLBACK_FAILED: '+$item.Name) -ErrorAction Continue}
    }
    @{status='failed';backup=$backup;error=$failure} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'result.json') -Encoding utf8
    throw ('STARTUP_REPAIR_FAILED: '+$failure+' Backup: '+$backup)
}
