# Touch-free Control experiment: what can Windows tell us is clickable?
# Scans the window you are looking at (e.g. YouTube in Chrome/Edge) with
# Windows UI Automation (the same accessibility info Voice Access uses),
# then draws a box around every clickable thing it found.
# No AI, no internet, nothing is sent anywhere. Read-only: it never clicks.
#
# Run: double-click run-experiment.bat, then switch to the YouTube window
# within 5 seconds. Press Esc (or wait 30 s) to close the overlay.

param(
    [int]$DelaySeconds = 5,
    [int]$OverlaySeconds = 30
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TfcWin {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@

# UI Automation reports physical pixels; make our overlay use them too.
[void][TfcWin]::SetProcessDPIAware()

Write-Host ""
Write-Host "Touch-free Control - click target scan" -ForegroundColor Cyan
Write-Host "Switch to the YouTube (or any) window now..."
for ($i = $DelaySeconds; $i -gt 0; $i--) { Write-Host "  $i"; Start-Sleep -Seconds 1 }

$hwnd = [TfcWin]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][TfcWin]::GetWindowText($hwnd, $sb, 512)
$title = $sb.ToString()
Write-Host "Scanning window: $title" -ForegroundColor Yellow

$root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
$winRect = $root.Current.BoundingRectangle

$CT = [System.Windows.Automation.ControlType]
$P = [System.Windows.Automation.AutomationElement]
$clickableTypes = @(
    $CT::Button, $CT::Hyperlink, $CT::Edit, $CT::ListItem, $CT::MenuItem,
    $CT::TabItem, $CT::CheckBox, $CT::RadioButton, $CT::ComboBox,
    $CT::SplitButton, $CT::TreeItem
)
$conds = New-Object 'System.Collections.Generic.List[System.Windows.Automation.Condition]'
foreach ($t in $clickableTypes) {
    $conds.Add((New-Object System.Windows.Automation.PropertyCondition($P::ControlTypeProperty, $t)))
}
# Anything else that says "you can invoke (click) me".
$conds.Add((New-Object System.Windows.Automation.PropertyCondition($P::IsInvokePatternAvailableProperty, $true)))
$cond = [System.Windows.Automation.OrCondition]::new($conds.ToArray())

# Browsers switch on their accessibility tree only after someone asks,
# so ask once, wait a moment, then do the real scan.
[void]$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
Start-Sleep -Milliseconds 1500

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
$sw.Stop()

$seen = @{}
$targets = New-Object System.Collections.ArrayList
foreach ($el in $found) {
    try {
        $c = $el.Current
        if ($c.IsOffscreen) { continue }
        $r = $c.BoundingRectangle
        if ($r.IsEmpty -or $r.Width -lt 3 -or $r.Height -lt 3) { continue }
        if (-not $winRect.IntersectsWith($r)) { continue }
        $key = "{0},{1},{2},{3}" -f [int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $type = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
        $name = ($c.Name -replace '\s+', ' ').Trim()
        if ($name.Length -gt 60) { $name = $name.Substring(0, 60) + '...' }
        [void]$targets.Add([pscustomobject]@{
            N = $targets.Count + 1; Type = $type; Name = $name
            X = [int]$r.X; Y = [int]$r.Y; W = [int]$r.Width; H = [int]$r.Height
        })
    } catch { }  # element disappeared while we were reading it
}

Write-Host ""
Write-Host ("Found {0} clickable things on screen in {1:N1} s" -f $targets.Count, $sw.Elapsed.TotalSeconds) -ForegroundColor Green
$targets | Group-Object Type | Sort-Object Count -Descending |
    ForEach-Object { Write-Host ("  {0,-12} {1}" -f $_.Name, $_.Count) }

$csv = Join-Path $PSScriptRoot ("click-targets-{0:yyyyMMdd-HHmmss}.csv" -f (Get-Date))
$targets | Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8
Write-Host "List saved: $csv"
Write-Host "Showing boxes for $OverlaySeconds s. Press Esc to close early."

if ($targets.Count -eq 0) {
    Write-Host "Nothing found. Try clicking inside the page once, then run again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit
}

# ---- Overlay: transparent, always on top, clicks pass through ----
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Bounds = $vs
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::Magenta
$form.TransparencyKey = [System.Drawing.Color]::Magenta
$form.KeyPreview = $true

$colors = @{
    Hyperlink = [System.Drawing.Color]::DeepSkyBlue
    Button    = [System.Drawing.Color]::LimeGreen
    Edit      = [System.Drawing.Color]::Orange
    ListItem  = [System.Drawing.Color]::Violet
}
$font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)

$form.Add_Paint({
    param($s, $e)
    $g = $e.Graphics
    foreach ($t in $targets) {
        $col = $colors[$t.Type]
        if (-not $col) { $col = [System.Drawing.Color]::Yellow }
        $pen = New-Object System.Drawing.Pen($col, 2)
        $x = $t.X - $vs.X; $y = $t.Y - $vs.Y
        $g.DrawRectangle($pen, $x, $y, $t.W, $t.H)
        $brush = New-Object System.Drawing.SolidBrush($col)
        $label = [string]$t.N
        $size = $g.MeasureString($label, $font)
        $g.FillRectangle($brush, $x, $y, $size.Width, $size.Height)
        $g.DrawString($label, $font, [System.Drawing.Brushes]::Black, $x, $y)
        $pen.Dispose(); $brush.Dispose()
    }
    $legend = "Touch-free scan: $($targets.Count) targets  |  blue=link  green=button  orange=text box  violet=list item  yellow=other  |  Esc = close"
    $g.FillRectangle([System.Drawing.Brushes]::Black, 10, 10, 760, 24)
    $g.DrawString($legend, $font, [System.Drawing.Brushes]::White, 14, 13)
})

$form.Add_Shown({
    # WS_EX_LAYERED | WS_EX_TRANSPARENT: mouse clicks go through the overlay.
    $GWL_EXSTYLE = -20
    $ex = [TfcWin]::GetWindowLong($form.Handle, $GWL_EXSTYLE)
    [void][TfcWin]::SetWindowLong($form.Handle, $GWL_EXSTYLE, ($ex -bor 0x80000 -bor 0x20))
    $form.Activate()
})
$form.Add_KeyDown({ param($s, $e) if ($e.KeyCode -eq 'Escape') { $form.Close() } })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $OverlaySeconds * 1000
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$timer.Start()

[void]$form.ShowDialog()
$timer.Dispose(); $font.Dispose(); $form.Dispose()
Write-Host "Done."
