param([switch]$Install,[switch]$Remove)
$ErrorActionPreference='Stop'
$taskName='Living Universe Grok Gateway'
if($Install -and $Remove){throw 'Choose Install or Remove.'}
if($Remove){Stop-ScheduledTask -TaskName $taskName;Unregister-ScheduledTask -TaskName $taskName -Confirm:$false;exit}
$repo=Split-Path -Parent $PSScriptRoot
$node=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if(-not(Test-Path -LiteralPath $node)){$node=(Get-Command node).Source}
$action=New-ScheduledTaskAction -Execute $node -Argument ('"'+(Join-Path $PSScriptRoot 'grok-task-runner.mjs')+'"') -WorkingDirectory $repo
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
if(-not $Install){[pscustomobject]@{TaskName=$taskName;Execute=$node;Arguments=$action.Arguments;User=$user;RunLevel='Limited';Trigger='At user logon';PublicExposure='None; configure separately after approval'}|ConvertTo-Json;exit}
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Task already exists; inspect before replacing it.'}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
$catalogueTask='Living Universe catalogue runtime'
if(-not(Get-ScheduledTask -TaskName $catalogueTask -ErrorAction SilentlyContinue)){
 $catalogueAction=New-ScheduledTaskAction -Execute $node -Argument ('"'+(Join-Path $repo 'app\start-existing.mjs')+'"') -WorkingDirectory $repo
 Register-ScheduledTask -TaskName $catalogueTask -Action $catalogueAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
}
Write-Output 'Grok gateway task installed. Public exposure was not enabled.'
