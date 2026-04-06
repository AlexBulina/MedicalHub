@echo off
setlocal

cd /d "%~dp0"

set "BRIDGE_ENV=%CD%\sysmex_ca1500_bridge.env"
set "EXAMPLE_ENV=%CD%\sysmex_ca1500_bridge.env.example"

if not exist "%BRIDGE_ENV%" (
    echo [CA1500-EMU] File sysmex_ca1500_bridge.env not found.
    if exist "%EXAMPLE_ENV%" (
        echo [CA1500-EMU] Copy sysmex_ca1500_bridge.env.example to sysmex_ca1500_bridge.env and fill in your settings.
    )
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=%BRIDGE_ENV%"

echo [CA1500-EMU] Starting CA-1500 emulator with env: %BRIDGE_ENV%
echo [CA1500-EMU] Press Ctrl+C to stop.
node sysmex_ca1500_emulator.js %*

echo.
echo [CA1500-EMU] Emulator stopped.
pause
