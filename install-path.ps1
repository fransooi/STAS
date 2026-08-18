# install-path.ps1 - manages the STAS entry in the user PATH.
# ------------------------------------------------------------------
# Called by install.bat (keep the two together).
#   - idempotent: the current root is added only once
#   - clean: a previous installation (moved/copied folder) is removed
#     - entry containing a STAS.bat elsewhere, or dead ending in \STAS.
#     Foreign entries are NEVER touched.
#   - correct: reads/writes the registry WITHOUT expanding %VARIABLES%
#     and preserves the value kind (REG_EXPAND_SZ), then broadcasts
#     WM_SETTINGCHANGE so new terminals see the PATH.
#   - hygiene: removes a possible unix wrapper ~/.local/bin/stas
#     (put there by install.sh by mistake on Windows - extensionless
#     file, recognized by its "par install.sh" marker).
param([Parameter(Mandatory=$true)][string]$StasDir)
$ErrorActionPreference='Stop'

$dir=$StasDir.TrimEnd('\')

# --- hygiene: rogue unix wrapper on Windows? ---------------------------
$rogue=Join-Path $env:USERPROFILE '.local\bin\stas'
if(Test-Path -LiteralPath $rogue -PathType Leaf){
  $txt=Get-Content -LiteralPath $rogue -Raw -ErrorAction SilentlyContinue
  if($txt -match 'install\.sh'){
    Remove-Item -LiteralPath $rogue -Force
    Write-Host '[cleanup] unix wrapper removed: ~\.local\bin\stas (useless on Windows)'
  }
}

# --- raw read (no expansion) + value kind --------------------------------
$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true)
$noExp=[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
$raw=$k.GetValue('Path',$null,$noExp)
if($null -eq $raw){ $raw=''; $vk=[Microsoft.Win32.RegistryValueKind]::ExpandString }
else{ $vk=$k.GetValueKind('Path') }

# --- sort: keep / remove ---------------------------------------------------
$kept=@(); $stale=@(); $had=$false
foreach($x in $raw.Split(';')){
  if([string]::IsNullOrWhiteSpace($x)){ continue }
  $t=$x.Trim().TrimEnd('\')
  $exp=[Environment]::ExpandEnvironmentVariables($t).TrimEnd('\')
  if($exp -ieq $dir){ $had=$true; $kept+=$t; continue }   # original text preserved
  $isOld=(Test-Path -LiteralPath (Join-Path $exp 'STAS.bat')) -or
         ((-not (Test-Path -LiteralPath $exp)) -and ((Split-Path -Leaf $exp) -ieq 'STAS'))
  if($isOld){ $stale+=$t } else { $kept+=$t }
}
foreach($s in $stale){
  Write-Host ('[cleanup] previous installation removed from PATH: ' + $s)
}
if(-not $had){ $kept+=$dir }
$new=($kept -join ';')

# --- write (kind preserved) + broadcast WM_SETTINGCHANGE ------------------
if($new -ne $raw){ $k.SetValue('Path',$new,$vk) }
$k.Close()

# Environment.SetEnvironmentVariable broadcasts the message but flattens
# the kind; RegistryKey preserves the kind but does not broadcast. Do both
# on the right side: direct registry + manual broadcast.
$sig=@'
[DllImport("user32.dll",SetLastError=true,CharSet=CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd,uint Msg,UIntPtr wParam,string lParam,uint fuFlags,uint uTimeout,out UIntPtr lpdwResult);
'@
$w32=Add-Type -MemberDefinition $sig -Name 'W32SettingChange' -PassThru
[UIntPtr]$res=[UIntPtr]::Zero
$null=$w32::SendMessageTimeout([IntPtr]0xffff,0x1A,[UIntPtr]::Zero,'Environment',2,5000,[ref]$res)

if($had){ Write-Host '[ok] folder already in the user PATH' }
else    { Write-Host '[ok] folder added to the user PATH' }
