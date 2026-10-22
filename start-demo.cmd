@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.workbuddy-ai\binaries\node\versions\22.22.2-6\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
set "PYTHON_EXE=%USERPROFILE%\.workbuddy-ai\binaries\python\versions\3.13.12\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"
if not exist ".tools\gitleaks.exe" (
  "%PYTHON_EXE%" scripts\bootstrap-tools.py gitleaks
  if errorlevel 1 exit /b 1
)
"%NODE_EXE%" apps\sample-service\server.mjs
