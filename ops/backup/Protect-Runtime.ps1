param([Parameter(Mandatory=$true)][string]$LocalBase,[Parameter(Mandatory=$true)][string]$DataDir,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if(Test-Path -LiteralPath $OutputFile){throw 'Encrypted output already exists.'}
$entries=[System.Collections.Generic.List[object]]::new()
function Add-PrivateFile([string]$File,[string]$Logical){
  if(-not(Test-Path -LiteralPath $File -PathType Leaf)){return}
  $item=Get-Item -LiteralPath $File -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked private configuration refused.'}
  $bytes=[IO.File]::ReadAllBytes($item.FullName)
  $entries.Add(@{path=$Logical;bytes=[Convert]::ToBase64String($bytes)})
}
foreach($name in @('mcp-config.json','mcp-tunnel-key.xml')){Add-PrivateFile (Join-Path $LocalBase $name) ('local-base/'+$name)}
foreach($name in @('grok-gateway.json','mcp-writes.json','mobile-access.json','image-generation.json','sogni-key.dpapi')){Add-PrivateFile (Join-Path $DataDir $name) ('data-dir/'+$name)}
foreach($pair in @(@((Join-Path $LocalBase 'mcp-runtime\profiles'),'local-base/mcp-runtime/profiles'),@((Join-Path $DataDir 'grok-runtime'),'data-dir/grok-runtime'))){
  if(Test-Path -LiteralPath $pair[0]){foreach($file in Get-ChildItem -LiteralPath $pair[0] -Recurse -File -Force){
    if($file.Extension -in @('.json','.yaml','.yml','.xml','.dpapi')){Add-PrivateFile $file.FullName ($pair[1]+'/'+$file.FullName.Substring($pair[0].Length+1).Replace('\','/'))}
  }}
}
$taskCount=0
foreach($task in @(Get-ScheduledTask -TaskName '*Living*Universe*' -ErrorAction SilentlyContinue)){
  $xml=Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath
  $entries.Add(@{path=('scheduled-tasks/'+$task.TaskName+'.xml');bytes=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($xml))});$taskCount++
}
$tailscale=Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if(Test-Path -LiteralPath $tailscale){
  foreach($kind in @('serve','funnel')){
    $text=(& $tailscale $kind status --json 2>$null | Out-String)
    if($LASTEXITCODE -eq 0){$entries.Add(@{path=('network/'+$kind+'-status.json');bytes=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))})}
  }
}
$payload=@{format=1;captured_at_utc=[DateTime]::UtcNow.ToString('o');account_sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;files=@($entries.ToArray())}|ConvertTo-Json -Depth 8 -Compress
$plain=[Text.Encoding]::UTF8.GetBytes($payload)
try{$protected=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes($OutputFile,$protected)}finally{[Array]::Clear($plain,0,$plain.Length)}
@{encrypted_files=$entries.Count;scheduled_tasks=$taskCount;protection='Windows DPAPI CurrentUser; same Windows account/profile required; reconnect on replacement machines'}|ConvertTo-Json -Compress
