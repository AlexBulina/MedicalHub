@echo off
setlocal

cd /d "%~dp0"

set "BRIDGE_ENV=%CD%\sysmex_ca1500_bridge.env"
set "EXAMPLE_ENV=%CD%\sysmex_ca1500_bridge.env.example"

if not exist "%BRIDGE_ENV%" (
    echo [CA1500] File sysmex_ca1500_bridge.env not found.
    if exist "%EXAMPLE_ENV%" (
        echo [CA1500] Copy sysmex_ca1500_bridge.env.example to sysmex_ca1500_bridge.env and fill in your settings.
    )
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=%BRIDGE_ENV%"

echo [CA1500] Starting ASTM COM bridge with env: %BRIDGE_ENV%
echo [CA1500] Press Ctrl+C to stop.
node sysmex_ca1500_agent.js

echo.
echo [CA1500] Bridge stopped.
pause
