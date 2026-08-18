# 重启 dsh web 后端，使 dsh-ui-three-body 的改动全部生效：
#   - host 侧 lib/kernel.js 内核改名（需进程重载）
#   - settings.yaml 的 petPos 重置（需重读）
#   - client bundle 重新哈希（新 rev 注入 boot manifest）
# 后台调用：先延迟等本轮回复送达，再杀旧进程、拉起新进程，日志落盘可查。

param([int]$DelaySeconds = 8)

Start-Sleep -Seconds $DelaySeconds

$bin = 'C:\Users\Administrator\AppData\Roaming\com.eternalnight.dshdesktop\dsh-online\node_modules\@deepseek-ai\dsh\lib\bin.js'
$node = 'C:\Program Files\nodejs\node.exe'
$out = 'C:\Users\Administrator\.dsh\logs\dsh-restart.out.log'
$err = 'C:\Users\Administrator\.dsh\logs\dsh-restart.err.log'

# 1. 杀 dsh web 进程（与桌面壳 cleanup_stale_dsh 相同的匹配特征：dsh + bin.js + web）。
$killed = @()
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*dsh*bin.js*web*' } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $killed += $_.ProcessId } catch {}
  }
"$(Get-Date -Format o) killed: $($killed -join ',')" | Out-File -FilePath $out -Append -Encoding utf8

# 2. 等 5399 端口释放（固定等待，避免端口未释放导致 EADDRINUSE）。
Start-Sleep -Seconds 4

# 3. 用系统 node 重新拉起 dsh web。
Start-Process -FilePath $node -ArgumentList @("`"$bin`"", 'web', '--port', '5399') -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
"$(Get-Date -Format o) relaunched dsh web on 5399 (node=$node)" | Out-File -FilePath $out -Append -Encoding utf8
