param([ValidateSet('Setup','SelfTest')][string]$Mode='Setup',[Parameter(Mandatory=$true)][string]$DataDir)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
function Set-PrivateKeyFileAcl([string]$FilePath) {
  $acl=New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true,$false)
  $user=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $system=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($user,'FullControl','Allow')))
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($system,'FullControl','Allow')))
  [IO.File]::SetAccessControl($FilePath,$acl)
}
try {
  if($Mode -eq 'SelfTest') {
    $fake='self-test-'+[Guid]::NewGuid().ToString()
    $secure=ConvertTo-SecureString $fake -AsPlainText -Force
    try{$cipher=ConvertFrom-SecureString $secure}finally{$secure.Dispose()}
    $testPath=Join-Path ([IO.Path]::GetTempPath()) ('lu-pilot-key-test-'+[Guid]::NewGuid().ToString()+'.tmp')
    try {
      [IO.File]::WriteAllText($testPath,$cipher,[Text.Encoding]::ASCII)
      Set-PrivateKeyFileAcl $testPath
      $savedCipher=[IO.File]::ReadAllText($testPath)
      $rules=([IO.File]::GetAccessControl($testPath)).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])
      $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')
      if(@($rules | Where-Object {$_.IdentityReference.Value -notin $allowed -or $_.IsInherited}).Count -ne 0){throw 'Unexpected key ACL'}
    }finally{if(Test-Path -LiteralPath $testPath){Remove-Item -LiteralPath $testPath -Force}}
    $roundtrip=ConvertTo-SecureString $savedCipher
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($roundtrip)
    try{if([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) -ne $fake){throw 'DPAPI self-test failed'}}
    finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$roundtrip.Dispose()}
    Write-Output 'PILOT_DPAPI_SELF_TEST_OK';exit 0
  }
  $expected=Join-Path $env:USERPROFILE 'AppData\Local\LivingUniverse\analysis-trial\credentials'
  if(-not [IO.Path]::IsPathRooted($DataDir) -or -not [string]::Equals([IO.Path]::GetFullPath($DataDir).TrimEnd('\'),[IO.Path]::GetFullPath($expected).TrimEnd('\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected credential folder'}
  $DataDir=[IO.Path]::GetFullPath($DataDir)
  $part=$DataDir
  while($part){
    if((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Credential path contains a reparse point'}
    $part=Split-Path -Parent $part
  }
  $keyPath=Join-Path $DataDir 'openai-analysis-key.dpapi'
  Add-Type -AssemblyName PresentationFramework
  $window=New-Object Windows.Window
  $window.Title='Living Universe - OpenAI tesztkulcs';$window.Width=590;$window.Height=340;$window.ResizeMode='NoResize';$window.WindowStartupLocation='CenterScreen';$window.ShowInTaskbar=$true
  $panel=New-Object Windows.Controls.StackPanel;$panel.Margin='22';$window.Content=$panel
  $info=New-Object Windows.Controls.TextBlock;$info.Text="Az új OpenAI API-kulcsot ide másold be.`nWindows-titkosítással, csak ezen a gépen mentjük.`nEz az ablak nem indít modellhívást és nem tölt fel képet.";$info.TextWrapping='Wrap';$info.Margin='0,0,0,18';$panel.Children.Add($info)|Out-Null
  $password=New-Object Windows.Controls.PasswordBox;$password.MaxLength=8192;$password.Height=30;$password.Margin='0,0,0,12';$panel.Children.Add($password)|Out-Null
  $replace=New-Object Windows.Controls.CheckBox;$replace.Content='A korábban mentett tesztkulcs cseréje';$replace.Margin='0,0,0,10';$replace.Visibility=if(Test-Path -LiteralPath $keyPath){'Visible'}else{'Collapsed'};$panel.Children.Add($replace)|Out-Null
  $status=New-Object Windows.Controls.TextBlock;$status.TextWrapping='Wrap';$status.Margin='0,0,0,12';$panel.Children.Add($status)|Out-Null
  $buttons=New-Object Windows.Controls.StackPanel;$buttons.Orientation='Horizontal';$buttons.HorizontalAlignment='Right';$panel.Children.Add($buttons)|Out-Null
  $save=New-Object Windows.Controls.Button;$save.Content='Kulcs mentése helyben';$save.Padding='12,7';$save.Margin='0,0,10,0';$buttons.Children.Add($save)|Out-Null
  $cancel=New-Object Windows.Controls.Button;$cancel.Content='Mégse';$cancel.Padding='12,7';$buttons.Children.Add($cancel)|Out-Null
  $result=[PSCustomObject]@{saved=$false}
  $cancel.Add_Click({$password.Clear();$window.Close()})
  $save.Add_Click({
    try {
      if($password.SecurePassword.Length -lt 20){$status.Text='Másold be a teljes titkos API-kulcsot, ne a kulcs nevét.';return}
      if((Test-Path -LiteralPath $keyPath) -and -not $replace.IsChecked){$status.Text='A cseréhez jelöld be a meglévő tesztkulcs cseréjét.';return}
      $secure=$password.SecurePassword.Copy()
      try{$encrypted=ConvertFrom-SecureString $secure}finally{$secure.Dispose();$password.Clear()}
      [IO.Directory]::CreateDirectory($DataDir)|Out-Null
      $temp=Join-Path $DataDir ('openai-analysis-'+[Guid]::NewGuid().ToString()+'.tmp')
      [IO.File]::WriteAllText($temp,$encrypted,[Text.Encoding]::ASCII)
      Set-PrivateKeyFileAcl $temp
      Move-Item -LiteralPath $temp -Destination $keyPath -Force
      $receipt=[PSCustomObject]@{saved=$true;protected_by='Windows DPAPI CurrentUser';saved_at=[DateTime]::UtcNow.ToString('o');credential_tested=$false;external_calls=0}
      [IO.File]::WriteAllText((Join-Path $DataDir 'setup-receipt.json'),($receipt|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
      $result.saved=$true;$window.Close()
    }catch{$password.Clear();$status.Text='A helyi mentés nem sikerült. A kulcs nem került naplóba; jelezd a mentési hibát a chatben.'}
  })
  $window.Add_ContentRendered({$window.Activate()|Out-Null;$password.Focus()|Out-Null})
  $window.ShowDialog()|Out-Null
  $password.Clear()
  if($result.saved){Write-Output 'PILOT_KEY_SAVED_LOCALLY_NOT_TESTED'}else{Write-Output 'PILOT_KEY_SETUP_CANCELLED'}
}catch{[Console]::Error.WriteLine('PILOT_KEY_SETUP_FAILED: No secret is included in this message.');exit 1}
