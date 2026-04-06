@echo off
setlocal enabledelayedexpansion

:: ══════════════════════════════════════════════════════════════════════════════
::  DRAIS Relay — Windows Installer
::  - Copies relay binary to %APPDATA%\DRAIS\Relay\
::  - Creates Windows startup registry entry (auto-start on login)
::  - Installs GUI (NSIS exe) if present
::  - Creates Desktop shortcut for the GUI
:: ══════════════════════════════════════════════════════════════════════════════

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║     DRAIS Relay — Windows Installer v2.0             ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set "WORKERS_DIR=%~dp0.."
set "DIST_DIR=%WORKERS_DIR%\dist"
set "DIST_GUI_DIR=%WORKERS_DIR%\dist-gui"
set "INSTALL_DIR=%APPDATA%\DRAIS\Relay"
set "CFG_DIR=%APPDATA%\DRAIS\Relay"
set "CFG_FILE=%CFG_DIR%\config.json"
set "BIN_DEST=%INSTALL_DIR%\drais-relay.exe"

:: Step 1: Create install directory
echo [1/5] Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo     OK: %INSTALL_DIR%

:: Step 2: Copy relay binary
echo [2/5] Installing relay binary...
set "BIN_SRC=%DIST_DIR%\drais-relay-win-x64.exe"
if not exist "%BIN_SRC%" set "BIN_SRC=%DIST_DIR%\drais-relay-win.exe"
if not exist "%BIN_SRC%" (
  echo     ERROR: Binary not found in %DIST_DIR%
  echo     Run: cd workers ^&^& npm run build:win
  pause
  exit /b 1
)
copy /Y "%BIN_SRC%" "%BIN_DEST%" >nul
echo     OK: %BIN_DEST%

:: Step 3: Write default config if not present
echo [3/5] Setting up configuration...
if not exist "%CFG_FILE%" (
  (
    echo {
    echo   "drais_url":   "https://sims.drais.pro",
    echo   "device_ip":   "192.168.1.197",
    echo   "device_sn":   "GED7254601154",
    echo   "relay_key":   "DRAIS-355DF9C35EB60899009C01DD948EAD14",
    echo   "device_port": 4370,
    echo   "poll_ms":     2000
    echo }
  ) > "%CFG_FILE%"
  echo     OK: Default config written to %CFG_FILE%
) else (
  echo     OK: Config already exists ^(not overwritten^)
)
echo     Edit: notepad "%CFG_FILE%"

:: Step 4: NSIS installer (GUI)
echo [4/5] Installing GUI...
set "NSIS_EXE="
for %%f in ("%DIST_GUI_DIR%\*.exe") do set "NSIS_EXE=%%f"

if defined NSIS_EXE (
  if exist "%NSIS_EXE%" (
    echo     Running installer: %NSIS_EXE%
    "%NSIS_EXE%" /S
    echo     OK: GUI installed
  ) else (
    echo     WARN: GUI installer not found. Run: npm run build:win in relay-app\
  )
) else (
  echo     WARN: GUI installer not found. The relay binary is installed headless.
)

:: Step 5: Windows startup (auto-start relay binary at login via registry)
echo [5/5] Setting up auto-start...
set "STARTUP_CMD=cmd /c start /min "" "%BIN_DEST%""

:: Use reg ADD to create startup registry key (no admin needed, HKCU)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
  /v "DRAIS-Relay" /t REG_SZ ^
  /d "%STARTUP_CMD%" /f >nul 2>&1

if %errorlevel% equ 0 (
  echo     OK: Auto-start registered ^(HKCU Run^)
) else (
  echo     WARN: Could not set registry auto-start
  echo     Manually add to startup: %BIN_DEST%
)

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║  ✓  DRAIS Relay installed successfully               ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Binary  : %BIN_DEST%
echo  ║  Config  : %CFG_FILE%
echo  ║  Starts  : Automatically on Windows login            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Start the relay now
echo Starting relay now...
start /min "" "%BIN_DEST%"
echo     OK: Relay started in background

echo.
echo  Edit config and restart if needed:
echo    notepad "%CFG_FILE%"
echo    taskkill /IM drais-relay.exe /F ^&^& start "" "%BIN_DEST%"
echo.
pause
endlocal
