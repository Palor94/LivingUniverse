param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$NewDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if(Test-Path -LiteralPath $NewDirectory){throw 'Choose a NEW recovery directory; no live configuration is overwritten.'}
$protected=[IO.File]::ReadAllBytes($InputFile)
$plain=[Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try{$payload=[Text.Encoding]::UTF8.GetString($plain)|ConvertFrom-Json}finally{[Array]::Clear($plain,0,$plain.Length)}
if($payload.format -ne 1){throw 'Unknown private backup format.'}
$root=[IO.Path]::GetFullPath($NewDirectory)
foreach($entry in $payload.files){
  if([IO.Path]::IsPathRooted($entry.path) -or $entry.path -match '(^|[\\/])\.\.?([\\/]|$)' -or $entry.path.Contains(':')){throw 'Unsafe recovery entry.'}
}
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($entry in $payload.files){$target=[IO.Path]::GetFullPath((Join-Path $root $entry.path));if(-not $target.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Recovery path escaped.'};[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;[IO.File]::WriteAllBytes($target,[Convert]::FromBase64String($entry.bytes))}
Write-Output ('Private files recovered for inspection only: '+$payload.files.Count+'. No task, endpoint or credential was activated.')
