@echo off
setlocal

cd /d "%~dp0"

set "BRIDGE_ENV=%CD%\serial_urine_bridge.env"
set "EXAMPLE_ENV=%CD%\serial_urine_bridge.env.example"

if not exist "%BRIDGE_ENV%" (
    echo [SERIAL-URINE-EMU] File serial_urine_bridge.env not found.
    if exist "%EXAMPLE_ENV%" (
        echo [SERIAL-URINE-EMU] Copy serial_urine_bridge.env.example to serial_urine_bridge.env and fill in your settings.
    )
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=%BRIDGE_ENV%"

echo [SERIAL-URINE-EMU] Starting Clinitek emulator with env: %BRIDGE_ENV%
echo [SERIAL-URINE-EMU] Press Ctrl+C to stop.
node serial_urine_analyzer_emulator.js %*

echo.
echo [SERIAL-URINE-EMU] Emulator stopped.
pause
