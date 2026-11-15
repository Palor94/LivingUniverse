param([ValidateSet('Setup','Read')][string]$Mode='Setup',[string]$DataDir)
$ErrorActionPreference='Stop'
try {
  if (-not $DataDir) {
    $localBase=Join-Path $env:USERPROFILE 'AppData\Local\LivingUniverse'
    $config=Get-Content -LiteralPath (Join-Path $localBase 'mcp-config.json') -Raw | ConvertFrom-Json
    $DataDir=Split-Path -Parent $config.database
  }
  if (-not [IO.Path]::IsPathRooted($DataDir)) { throw 'Invalid local data folder.' }
  $DataDir=[IO.Path]::GetFullPath($DataDir)
  $project=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')+'\'
  $dataBoundary=$DataDir.TrimEnd('\')+'\'
  if ($dataBoundary.StartsWith($project,[StringComparison]::OrdinalIgnoreCase)) { throw 'Credentials must stay outside the project and OneDrive.' }
  foreach ($syncRoot in @($env:OneDrive,$env:OneDriveConsumer,$env:OneDriveCommercial)) {
    if ($syncRoot -and $dataBoundary.StartsWith(([IO.Path]::GetFullPath($syncRoot).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Credentials must stay outside OneDrive.' }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'universe.sqlite') -PathType Leaf)) { throw 'The existing catalogue was not found. No replacement was created.' }
  $keyPath=Join-Path $DataDir 'xai-key.dpapi'
  if ($Mode -eq 'Read') {
    $secure=ConvertTo-SecureString ((Get-Content -LiteralPath $keyPath -Raw).Trim())
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
    exit 0
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form=New-Object Windows.Forms.Form
  $form.Text='Living Universe - Grok (xAI)';$form.ClientSize=New-Object Drawing.Size(520,200);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false
  $label=New-Object Windows.Forms.Label;$label.Text="xAI API kulcs (console.x.ai)`r`nWindows-titkositassal mentve, a OneDrive-on kivul.`r`nA mentes nem indit fizetos hivast.";$label.SetBounds(20,15,480,65);$form.Controls.Add($label)
  $keyBox=New-Object Windows.Forms.TextBox;$keyBox.UseSystemPasswordChar=$true;$keyBox.SetBounds(20,90,480,25);$form.Controls.Add($keyBox)
  $form.ShowInTaskbar=$true;$form.TopMost=$true
  $form.Add_Shown({$form.Activate();$keyBox.Focus()})
  $save=New-Object Windows.Forms.Button;$save.Text='Mentes';$save.SetBounds(300,140,100,30)
  $cancel=New-Object Windows.Forms.Button;$cancel.Text='Megse';$cancel.DialogResult='Cancel';$cancel.SetBounds(410,140,90,30);$form.Controls.AddRange(@($save,$cancel));$form.CancelButton=$cancel
  $save.Add_Click({
    if($keyBox.Text.Trim() -match '\s'){[Windows.Forms.MessageBox]::Show('A kulcs nem tartalmazhat szokozt vagy sortorest.');return}
    if($keyBox.Text.Trim().Length -lt 8){[Windows.Forms.MessageBox]::Show('Add meg az xAI API kulcsot.');return}
    $form.DialogResult='OK';$form.Close()
  })
  if($form.ShowDialog() -ne 'OK'){Write-Output 'Grok setup cancelled. No settings changed.';exit 0}
  $secure=ConvertTo-SecureString $keyBox.Text.Trim() -AsPlainText -Force
  try{$encrypted=ConvertFrom-SecureString $secure}finally{$secure.Dispose();$keyBox.Clear()}
  $keyTemp=Join-Path $DataDir ('xai-key-'+[Guid]::NewGuid().ToString()+'.tmp')
  [IO.File]::WriteAllText($keyTemp,$encrypted,[Text.Encoding]::ASCII)
  Move-Item -LiteralPath $keyTemp -Destination $keyPath -Force
  Write-Output 'Grok key saved. Restart Living Universe to load it. No paid call was made.'
  [Windows.Forms.MessageBox]::Show('Kulcs elmentve. Inditsd ujra a Living Universe-t. Fizetos hivas nem tortent.','Living Universe - Grok') | Out-Null
} catch {
  [Console]::Error.WriteLine(('XAI_SETUP_FAILED at step {0}: Check the existing local catalogue and Windows account. No secret is included in this message.' -f $_.InvocationInfo.ScriptLineNumber))
  exit 1
}
