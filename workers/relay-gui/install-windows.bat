@echo off
:: ============================================================================
::  DRAIS Relay Manager — Windows Installer
::  Run as regular user (no admin required for per-user install)
::  Double-click install-windows.bat in Explorer
:: ============================================================================
setlocal EnableDelayedExpansion

echo.
echo  ===========================================================
echo   DRAIS Relay Manager - Windows Installer
echo  ===========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "GUI_SCRIPT=%SCRIPT_DIR%relay_gui.py"
set "DIST_DIR=%SCRIPT_DIR%..\dist"
set "ICON_SRC=%SCRIPT_DIR%drais-relay.png"

:: ── 1. Check Python ──────────────────────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo  ✗  Python not found!
    echo     Download from: https://python.org/downloads
    echo     Make sure to check "Add Python to PATH"
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  ✓  %PYVER% found

:: ── 2. Install Python deps ───────────────────────────────────────────────────
echo.
echo  ─  Installing Python dependencies...
python -m pip install --user --quiet customtkinter Pillow
if errorlevel 1 (
    echo  ⚠  pip install failed. Trying without --user...
    python -m pip install customtkinter Pillow
)
echo  ✓  Dependencies installed

:: ── 3. Generate icon ─────────────────────────────────────────────────────────
echo.
echo  ─  Generating app icon...
python "%SCRIPT_DIR%generate_icon.py"

:: ── 4. Create Start Menu shortcut ────────────────────────────────────────────
echo.
echo  ─  Creating Start Menu shortcut...
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\DRAIS"
mkdir "%START_MENU%" 2>nul

set "VBS_TEMP=%TEMP%\make_shortcut.vbs"
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%START_MENU%\DRAIS Relay Manager.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "pythonw.exe"
echo oLink.Arguments = """%GUI_SCRIPT%"""
echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
echo oLink.Description = "DRAIS Relay Manager"
echo oLink.WindowStyle = 1
if exist "%ICON_SRC%" (
echo oLink.IconLocation = "%ICON_SRC%"
)
echo oLink.Save
) > "%VBS_TEMP%"

cscript //nologo "%VBS_TEMP%"
del "%VBS_TEMP%" 2>nul
echo  ✓  Start Menu shortcut created

:: ── 5. Create Windows Startup entry (autostart on login) ─────────────────────
echo.
echo  ─  Setting up autostart on Windows login...
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_STARTUP=%TEMP%\make_startup.vbs"
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%STARTUP_DIR%\DRAIS Relay Manager.lnk"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "pythonw.exe"
echo oLink.Arguments = """%GUI_SCRIPT% --autostart"""
echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
echo oLink.Description = "DRAIS Relay Manager (autostart)"
echo oLink.WindowStyle = 1
if exist "%ICON_SRC%" (
echo oLink.IconLocation = "%ICON_SRC%"
)
echo oLink.Save
) > "%VBS_STARTUP%"

cscript //nologo "%VBS_STARTUP%"
del "%VBS_STARTUP%" 2>nul
echo  ✓  Autostart on login configured (Windows Startup folder)

:: ── 6. Add Registry run key as backup ────────────────────────────────────────
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
    /v "DRAIS Relay Manager" ^
    /t REG_SZ ^
    /d "pythonw.exe \"%GUI_SCRIPT%\" --autostart" ^
    /f >nul 2>&1
echo  ✓  Registry startup key added (backup)

:: ── 7. Done ───────────────────────────────────────────────────────────────────
echo.
echo  ===========================================================
echo   Install Complete!
echo  ===========================================================
echo.
echo   Start Menu : Search "DRAIS Relay Manager"
echo   On Login   : App opens automatically with Windows
echo   Autostart  : Check "Auto-start relay on open" in the app
echo.
echo   Launch now? Press Y then Enter...
set /p LAUNCH="  [Y/n]: "
if /i "!LAUNCH!"=="y" (
    start pythonw.exe "%GUI_SCRIPT%"
) else if "!LAUNCH!"=="" (
    start pythonw.exe "%GUI_SCRIPT%"
)
echo.
pause
