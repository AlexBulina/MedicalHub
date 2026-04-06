@echo off
setlocal

cd /d "%~dp0"

set "BRIDGE_ENV=%CD%\serial_urine_bridge.env"
set "EXAMPLE_ENV=%CD%\serial_urine_bridge.env.example"

if not exist "%BRIDGE_ENV%" (
    echo [SERIAL-URINE] File serial_urine_bridge.env not found.
    if exist "%EXAMPLE_ENV%" (
        echo [SERIAL-URINE] Copy serial_urine_bridge.env.example to serial_urine_bridge.env and fill in your settings.
    )
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=%BRIDGE_ENV%"

echo [SERIAL-URINE] Starting COM bridge with env: %BRIDGE_ENV%
echo [SERIAL-URINE] Press Ctrl+C to stop.
node serial_urine_analyzer_agent.js

echo.
echo [SERIAL-URINE] Bridge stopped.
pause

