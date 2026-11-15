# Living Universe vezérlő (2026-11-11): egy helyen mutatja, mi fut, és tisztán újraindítja.
# Csak a projekt saját folyamataihoz nyúl (a parancssorukban ez a projektmappa vagy a
# tunnel-client.exe szerepel). A Codex / ChatGPT alkalmazás node folyamatait soha nem állítja le.
# Az ütemezett feladatokat nem módosítja, csak leállítja és elindítja őket.
param([string]$Action='menu')
$ErrorActionPreference='Stop'
$Root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Tasks=@('Living Universe catalogue runtime','Living Universe Grok Gateway','Living Universe Private MCP Tunnel')
$Ports=[ordered]@{'Program (4317)'='http://127.0.0.1:4317/';'Grok gateway (4320)'='http://127.0.0.1:4320/.well-known/oauth-authorization-server'}

function Get-Ours {
  $all=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='tunnel-client.exe'")
  $all | Where-Object { $_.Name -eq 'tunnel-client.exe' -or ($_.CommandLine -and ($_.CommandLine.Replace('/','\').IndexOf($Root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.CommandLine -match '(app|mcp)\\(server|start-existing|http-gateway|grok-task-runner|task-runner|start-tunnel)\.mjs')) }
}
function Get-Foreign { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'") | Where-Object { $ids=(Get-Ours).ProcessId; $ids -notcontains $_.ProcessId } }
function Role($p){
  $c=[string]$p.CommandLine
  if($p.Name -eq 'tunnel-client.exe'){return 'ChatGPT alagút'}
  if($c -match 'start-existing\.mjs|app[\\/]server\.mjs'){return 'Program (katalógus)'}
  if($c -match 'grok-task-runner\.mjs'){return 'Grok felügyelő'}
  if($c -match 'http-gateway\.mjs'){return 'Grok gateway'}
  if($c -match 'mcp[\\/]task-runner\.mjs'){return 'Alagút felügyelő'}
  if($c -match 'mcp[\\/]server\.mjs'){return 'ChatGPT MCP szerver'}
  if($c -match 'start-tunnel\.mjs'){return 'Alagút indító'}
  return 'Egyéb (projekt)'
}
function Test-Url($u){ try{ $r=Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 4; return $r.StatusCode -eq 200 }catch{ return $false } }

function Show-Status {
  Write-Host ''; Write-Host '=== Living Universe állapot ===' -ForegroundColor Cyan
  foreach($k in $Ports.Keys){ $ok=Test-Url $Ports[$k]; Write-Host ("  {0,-22} {1}" -f $k,$(if($ok){'válaszol'}else{'NEM válaszol'})) -ForegroundColor $(if($ok){'Green'}else{'Red'}) }
  foreach($t in $Tasks){ $st=(Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue).State; Write-Host ("  Feladat: {0,-36} {1}" -f $t,$(if($st){$st}else{'nincs ilyen feladat'})) }
  $ours=@(Get-Ours); Write-Host ''; Write-Host "  A projekt folyamatai ($($ours.Count)):"
  $groups=$ours | Group-Object { Role $_ }
  foreach($g in $groups){ $warn=($g.Count -gt 1 -and $g.Name -ne 'Egyéb (projekt)'); Write-Host ("    {0,-22} {1} db  (PID {2})" -f $g.Name,$g.Count,(($g.Group.ProcessId) -join ', ')) -ForegroundColor $(if($warn){'Yellow'}else{'Gray'}) }
  if($groups | Where-Object { $_.Count -gt 1 -and $_.Name -ne 'Egyéb (projekt)' }){ Write-Host '  Figyelem: valami kétszer fut. Az újraindítás (2) rendbe teszi.' -ForegroundColor Yellow }
  $foreign=@(Get-Foreign); if($foreign.Count){ Write-Host "  Más programok node folyamatai (Codex/ChatGPT stb., ezekhez nem nyúlunk): $($foreign.Count) db" -ForegroundColor DarkGray }
}

function Stop-Ours {
  foreach($t in $Tasks){ try{ Stop-ScheduledTask -TaskName $t -ErrorAction Stop }catch{} }
  # Supervisors first would restart their children, so everything is stopped in one go, then checked.
  for($i=0;$i -lt 3;$i++){ $ours=@(Get-Ours); if(-not $ours.Count){break}; foreach($p in $ours){ try{ Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop }catch{} }; Start-Sleep -Seconds 2 }
  $left=@(Get-Ours); if($left.Count){ Write-Host "  Nem minden állt le: PID $(($left.ProcessId) -join ', ')" -ForegroundColor Red } else { Write-Host '  Minden projektfolyamat leállt.' -ForegroundColor Green }
}

function Start-Ours {
  foreach($t in $Tasks){ if(Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue){ Start-ScheduledTask -TaskName $t } else { Write-Host "  Hiányzó ütemezett feladat: $t" -ForegroundColor Red } }
  Write-Host '  Indítás... (legfeljebb 60 mp)'
  $deadline=(Get-Date).AddSeconds(60)
  while((Get-Date) -lt $deadline){ $ok=@($Ports.Values | Where-Object { Test-Url $_ }).Count; if($ok -eq $Ports.Count){break}; Start-Sleep -Seconds 2 }
}

function Restart-All { Write-Host ''; Write-Host 'Újraindítás: leállítás...' -ForegroundColor Cyan; Stop-Ours; Start-Ours; Show-Status }

switch($Action){
  'status' { Show-Status }
  'restart' { Restart-All }
  'stop' { Stop-Ours; Show-Status }
  default {
    Show-Status
    while($true){
      Write-Host ''; Write-Host '  [1] Állapot frissítése   [2] Mindent újraindít   [3] Mindent leállít   [4] Program megnyitása   [Q] Kilépés'
      $k=(Read-Host '  Választás').Trim().ToLower()
      if($k -eq '1'){Show-Status}elseif($k -eq '2'){Restart-All}elseif($k -eq '3'){Stop-Ours;Show-Status}elseif($k -eq '4'){Start-Process 'http://127.0.0.1:4317/'}elseif($k -eq 'q' -or $k -eq ''){break}
    }
  }
}
