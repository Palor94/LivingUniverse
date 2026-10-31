param([switch]$Install, [switch]$Remove)
$ErrorActionPreference='Stop'
$taskName='Living Universe Private MCP Tunnel'
if($Install -and $Remove){throw 'Choose Install or Remove.'}
if($Remove){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false;exit}
$repo=Split-Path -Parent $PSScriptRoot
$node=(Get-Command node -ErrorAction SilentlyContinue).Source
if(-not $node){$node=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'}
if(-not (Test-Path -LiteralPath $node)){throw 'Node runtime unavailable.'}
$key=Join-Path $env:LOCALAPPDATA 'LivingUniverse\mcp-tunnel-key.xml'
if(-not (Test-Path -LiteralPath $key)){throw 'First run Start Tunnel.cmd interactively to save the encrypted credential.'}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+(Join-Path $PSScriptRoot 'task-runner.mjs')+'"') -WorkingDirectory $repo
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Existing private outbound MCP tunnel. Current user only; no public listener, new credential, or catalogue writes. Retries unexpected exits every minute.'
if(-not $Install){[pscustomobject]@{TaskName=$taskName;User=$user;Execute=$action.Execute;Arguments=$action.Arguments;WorkingDirectory=$repo;Trigger='At current user logon';RunLevel='Limited';RestartInterval='1 minute';RestartCount=999;ExecutionTimeLimit='Unlimited';MultipleInstances='IgnoreNew';BatteryAllowed=$true} | ConvertTo-Json;Write-Output 'PREVIEW ONLY. Use -Install after approval.';exit}
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Task already exists; inspect it instead of replacing it.'}
Register-ScheduledTask -TaskName $taskName -InputObject $task | Out-Null
Write-Output 'Installed for next sign-in. Existing running tunnel is left in place.'
