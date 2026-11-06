@echo off
rem Touch-free Control: click target scan experiment (read-only, offline)
powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0find-click-targets.ps1"
pause
