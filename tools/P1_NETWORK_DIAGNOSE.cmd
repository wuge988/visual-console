@echo off
setlocal
title Visual Console P1 LAN Diagnostics
powershell.exe -NoLogo -NoExit -ExecutionPolicy Bypass -File "%~dp0P1_NETWORK_DIAGNOSE.ps1"
