param([string]$TunnelClient=$env:LU_MCP_TUNNEL_CLIENT,[string]$TunnelProfile='living-universe',[string]$ProfileDirectory=$env:LU_MCP_PROFILE_DIRECTORY,[switch]$SaveKey)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$keyFile=Join-Path $env:LOCALAPPDATA 'LivingUniverse\mcp-tunnel-key.xml'
$pointer=[IntPtr]::Zero
$secret=$null
$plain=$null
$instanceMutex=$null
$ownsInstance=$false
$stage='password_entry'
try {
    if($env:LU_MCP_SELF_TEST -ne '1' -and [IO.Path]::GetFileName($TunnelClient) -eq 'tunnel-client.exe'){
        $stage='single_instance'
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        $instanceMutex=New-Object Threading.Mutex($false,('Local\LivingUniverseMcpTunnel-'+$sid))
        try{$ownsInstance=$instanceMutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$ownsInstance=$true}
        # Also detect a client launched by the preserved, pre-mutex helper.
        $profilePattern='--profile\s+"?'+[regex]::Escape($TunnelProfile)+'"?(?:\s|$)'
        $existing=Get-CimInstance Win32_Process -Filter "Name='tunnel-client.exe'" | Where-Object {$_.CommandLine -match $profilePattern}
        if(-not $ownsInstance -or $existing){[Console]::Out.WriteLine('TUNNEL_ALREADY_RUNNING: Keep the existing Living Universe tunnel open. No second client or key prompt was started.');exit 0}
    }
    if((Test-Path -LiteralPath $keyFile) -and $env:LU_MCP_NEW_KEY -ne '1' -and $env:LU_MCP_SELF_TEST -ne '1'){$secret=Import-Clixml -LiteralPath $keyFile}
    if($null -eq $secret){
        if($env:LU_MCP_UNATTENDED -eq '1'){throw 'Saved encrypted credential unavailable. Run Start Tunnel.cmd interactively.'}
        Add-Type -AssemblyName PresentationFramework
        $window=New-Object Windows.Window
        $window.Title='Living Universe - Private tunnel key'
        $window.Width=490;$window.Height=255;$window.ResizeMode='NoResize';$window.WindowStartupLocation='CenterScreen';$window.Topmost=$false
        $panel=New-Object Windows.Controls.StackPanel;$panel.Margin='20'
        $label=New-Object Windows.Controls.TextBlock;$label.Text='Paste the NEW restricted tunnel key below.';$label.Margin='0,0,0,12'
        $box=New-Object Windows.Controls.PasswordBox;$box.Height=32;$box.MaxLength=512
        $hint=New-Object Windows.Controls.TextBlock;$hint.Text='Input is hidden. Never paste a key into a command prompt.';$hint.TextWrapping='Wrap';$hint.Margin='0,12,0,12'
        $buttons=New-Object Windows.Controls.StackPanel;$buttons.Orientation='Horizontal'
        $connect=New-Object Windows.Controls.Button;$connect.Content='Connect';$connect.Width=100;$connect.Height=32;$connect.IsDefault=$true
        $cancel=New-Object Windows.Controls.Button;$cancel.Content='Cancel';$cancel.Width=100;$cancel.Height=32;$cancel.Margin='12,0,0,0';$cancel.IsCancel=$true
        $connect.Add_Click({if($box.SecurePassword.Length -ge 20){$window.DialogResult=$true}else{$hint.Text='Paste the complete new API key into the hidden box.'}})
        $buttons.Children.Add($connect)|Out-Null;$buttons.Children.Add($cancel)|Out-Null
        foreach($control in @($label,$box,$hint,$buttons)){$panel.Children.Add($control)|Out-Null};$window.Content=$panel
        if($env:LU_MCP_SELF_TEST -eq '1'){
            $box.Password='synthetic-test-input-not-a-real-key';$testSecret=$box.SecurePassword.Copy();$roundtrip=$testSecret|ConvertFrom-SecureString|ConvertTo-SecureString
            if($roundtrip -isnot [Security.SecureString]){throw 'Secure input test failed.'}
            $box.Clear();$testSecret.Dispose();$roundtrip.Dispose();[Console]::Out.WriteLine('SECURE_INPUT_SELF_TEST_OK');exit 0
        }
        $window.Add_ContentRendered({$box.Focus()|Out-Null})
        if($window.ShowDialog() -ne $true){[Console]::Out.WriteLine('Key entry cancelled. No key was saved.');exit 0}
        $secret=$box.SecurePassword.Copy();$box.Clear()
    }
    if($secret -isnot [Security.SecureString]){throw 'Invalid local credential.'}
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    if($plain -notmatch '^sk-[A-Za-z0-9_-]{20,500}$'){throw 'Invalid key format.'}
    $env:CONTROL_PLANE_API_KEY=$plain
    function Safe-Line($line){$safeLine=([string]$line) -replace 'sk-[A-Za-z0-9_-]+','[redacted key]';[Console]::Out.WriteLine($safeLine)}
    $ErrorActionPreference='Continue'
    $stage='local_preflight'
    & $TunnelClient doctor --profile $TunnelProfile --profile-dir $ProfileDirectory 2>&1 | ForEach-Object {Safe-Line $_}
    $doctorExit=$LASTEXITCODE
    $ErrorActionPreference='Stop'
    if($doctorExit -ne 0){throw 'Tunnel health check failed.'}
    $stage='encrypted_key_storage'
    if($SaveKey){New-Item -ItemType Directory -Path (Split-Path -Parent $keyFile) -Force|Out-Null;$secret|Export-Clixml -LiteralPath $keyFile}
    $ErrorActionPreference='Continue'
    $stage='tunnel_connection'
    & $TunnelClient run --profile $TunnelProfile --profile-dir $ProfileDirectory 2>&1 | ForEach-Object {Safe-Line $_}
    # An unattended client must remain running. A clean unexpected exit also
    # needs Task Scheduler recovery, without opening a hidden password prompt.
    if($env:LU_MCP_UNATTENDED -eq '1'){exit 1}
    if($LASTEXITCODE -ne 0){exit 1}
}catch{
    $detail=([string]$_.Exception.Message) -replace 'sk-[A-Za-z0-9_-]+','[redacted key]'
    [Console]::Error.WriteLine('TUNNEL_START_FAILED: stage='+$stage+'; type='+$_.Exception.GetType().Name+'; '+$detail+'. Never paste a key into the terminal.');exit 1
}finally{
    Remove-Item Env:CONTROL_PLANE_API_KEY -ErrorAction SilentlyContinue
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    $plain=$null;if($null -ne $secret){$secret.Dispose()}
    if($ownsInstance){$instanceMutex.ReleaseMutex()}
    if($null -ne $instanceMutex){$instanceMutex.Dispose()}
}
