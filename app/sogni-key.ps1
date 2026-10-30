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
  $keyPath=Join-Path $DataDir 'sogni-key.dpapi'
  if ($Mode -eq 'Read') {
    $secure=ConvertTo-SecureString ((Get-Content -LiteralPath $keyPath -Raw).Trim())
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
    exit 0
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $configPath=Join-Path $DataDir 'image-generation.json'
  $imageConfig=if(Test-Path -LiteralPath $configPath){Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json}else{[PSCustomObject]@{providers=[PSCustomObject]@{}}}
  if(-not $imageConfig.providers){$imageConfig | Add-Member -NotePropertyName providers -NotePropertyValue ([PSCustomObject]@{}) -Force}
  $form=New-Object Windows.Forms.Form
  $form.Text='Living Universe - Sogni';$form.ClientSize=New-Object Drawing.Size(520,280);$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false;$form.MinimizeBox=$false
  $label=New-Object Windows.Forms.Label;$label.Text="Sogni API key (dashboard.sogni.ai/api-key)`r`nSaved with Windows encryption, outside OneDrive.`r`nThis setup uploads no images and starts no paid job.";$label.SetBounds(20,15,480,65);$form.Controls.Add($label)
  $keyBox=New-Object Windows.Forms.TextBox;$keyBox.UseSystemPasswordChar=$true;$keyBox.SetBounds(20,85,480,25);$form.Controls.Add($keyBox)
  $form.ShowInTaskbar=$true;$form.TopMost=$true
  $form.Add_Shown({$form.Activate();$keyBox.Focus()})
  $modelLabel=New-Object Windows.Forms.Label;$modelLabel.Text='Image edit model:';$modelLabel.SetBounds(20,125,180,20);$form.Controls.Add($modelLabel)
  $model=New-Object Windows.Forms.ComboBox;$model.DropDownStyle='DropDownList';$model.SetBounds(20,150,480,25)
  $model.Items.AddRange([object[]]@('krea-identity-edit','dark-beast-krea2-identity-edit','qwen','qwen-lightning','flux-3-klein','gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare'));$model.SelectedIndex=0
  if($imageConfig.providers.sogni.model -and $model.Items.Contains($imageConfig.providers.sogni.model)){$model.SelectedItem=$imageConfig.providers.sogni.model};$form.Controls.Add($model)
  $save=New-Object Windows.Forms.Button;$save.Text='Save connection';$save.SetBounds(260,215,140,30)
  $cancel=New-Object Windows.Forms.Button;$cancel.Text='Cancel';$cancel.DialogResult='Cancel';$cancel.SetBounds(410,215,90,30);$form.Controls.AddRange(@($save,$cancel));$form.CancelButton=$cancel
  $save.Add_Click({
    if($keyBox.Text.Trim() -match '\s'){[Windows.Forms.MessageBox]::Show('The API key must not contain spaces or line breaks.');return}
    if($keyBox.Text.Trim().Length -lt 8 -and -not (Test-Path -LiteralPath $keyPath)){[Windows.Forms.MessageBox]::Show('Enter your Sogni API key.');return}
    $form.DialogResult='OK';$form.Close()
  })
  if($form.ShowDialog() -ne 'OK'){Write-Output 'Sogni setup cancelled. No settings changed.';exit 0}
  if($keyBox.Text.Trim()){
    $secure=ConvertTo-SecureString $keyBox.Text.Trim() -AsPlainText -Force
    try{$encrypted=ConvertFrom-SecureString $secure}finally{$secure.Dispose();$keyBox.Clear()}
    $keyTemp=Join-Path $DataDir ('sogni-key-'+[Guid]::NewGuid().ToString()+'.tmp')
    [IO.File]::WriteAllText($keyTemp,$encrypted,[Text.Encoding]::ASCII)
    Move-Item -LiteralPath $keyTemp -Destination $keyPath -Force
  }
  $chosen=[PSCustomObject]@{enabled=$true;model=[string]$model.SelectedItem}
  if($imageConfig.providers.sogni.loras -and $chosen.model -in @('krea-identity-edit','dark-beast-krea2-identity-edit')){
    $chosen | Add-Member -NotePropertyName loras -NotePropertyValue @($imageConfig.providers.sogni.loras)
    $chosen | Add-Member -NotePropertyName lora_strengths -NotePropertyValue @($imageConfig.providers.sogni.lora_strengths)
  }
  $imageConfig.providers | Add-Member -NotePropertyName sogni -NotePropertyValue $chosen -Force
  if(Test-Path -LiteralPath $configPath){Copy-Item -LiteralPath $configPath -Destination (Join-Path $DataDir ('image-generation-before-sogni-'+[Guid]::NewGuid().ToString()+'.json'))}
  $configTemp=Join-Path $DataDir ('image-generation-'+[Guid]::NewGuid().ToString()+'.tmp')
  [IO.File]::WriteAllText($configTemp,($imageConfig | ConvertTo-Json -Depth 15),(New-Object Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $configTemp -Destination $configPath -Force
  Write-Output 'Sogni connection saved. Restart Living Universe to load it. Account access and generation have not been tested.'
  [Windows.Forms.MessageBox]::Show('Connection saved. Restart Living Universe to load it. No images were uploaded and no generation was started.','Living Universe - Sogni') | Out-Null
} catch {
  [Console]::Error.WriteLine(('SOGNI_SETUP_FAILED at step {0}: Check the existing local catalogue and Windows account. No secret is included in this message.' -f $_.InvocationInfo.ScriptLineNumber))
  exit 1
}
