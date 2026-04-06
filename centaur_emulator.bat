@echo off
setlocal

cd /d "%~dp0"

set "BRIDGE_ENV=%CD%\advia_centaur_bridge.env"
set "EXAMPLE_ENV=%CD%\advia_centaur_bridge.env.example"

if not exist "%BRIDGE_ENV%" (
    echo [CENTAUR-EMU] File advia_centaur_bridge.env not found.
    if exist "%EXAMPLE_ENV%" (
        echo [CENTAUR-EMU] Copy advia_centaur_bridge.env.example to advia_centaur_bridge.env and fill in your settings.
    )
    pause
    exit /b 1
)

set "DOTENV_CONFIG_PATH=%BRIDGE_ENV%"

echo [CENTAUR-EMU] Starting ADVIA Centaur emulator with env: %BRIDGE_ENV%
echo [CENTAUR-EMU] Press Ctrl+C to stop.
node advia_centaur_emulator.js %*

echo.
echo [CENTAUR-EMU] Emulator stopped.
pause
