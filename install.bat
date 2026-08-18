@echo off
setlocal EnableDelayedExpansion

rem install.bat - STAS command installation (Windows)
rem ------------------------------------------------------------------
rem   1. checks Node.js            -> aborts cleanly if missing
rem   2. checks the version        -> Node >= 18 required
rem   3. adds this folder to the user PATH (the "stas" command)
rem   4. validates with the test suite
rem
rem Usage: after cloning, from this folder:
rem   install.bat

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo === STAS - installation ===
echo.

rem --- 0. launched from the project root? ------------------------------
if not exist "%ROOT%\package.json" (
  echo [ERROR] package.json not found - run install.bat from the root
  echo          of the cloned STAS folder.
  exit /b 1
)

rem --- 1. Node.js present? ----------------------------------------------
rem (query node directly; call is mandatory: if node is a .bat/.cmd
rem  shim, calling it without call would transfer control and stop
rem  the installer!)
call node --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed ^(or not in the PATH^).
  echo.
  echo          Install it from https://nodejs.org ^(version 18 or newer^)
  echo          then run install.bat again.
  exit /b 1
)

rem --- 2. Version >= 18? --------------------------------------------------
for /f "tokens=*" %%v in ('node --version') do set "NODEV=%%v"
set "MAJOR=%NODEV:~1%"
for /f "delims=." %%a in ("!MAJOR!") do set "MAJOR=%%a"
echo [ok] Node.js !NODEV! detected
if !MAJOR! LSS 18 (
  echo [ERROR] Node.js 18 or newer is required - you have !NODEV!.
  echo.
  echo          Update Node from https://nodejs.org then run again.
  exit /b 1
)

rem --- 3. User PATH --------------------------------------------------------
rem Delegates to install-path.ps1 (keep it next to install.bat):
rem idempotency, cleanup of previous installations, registry type
rem preservation (REG_EXPAND_SZ) and %%VARIABLES%%, removal of a
rem possible stray unix wrapper from ~/.local/bin/stas.
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\install-path.ps1" -StasDir "%ROOT%"
if errorlevel 1 (
  echo [ERROR] could not update the PATH - see the message above.
  exit /b 1
)

rem --- 4. Validation tests --------------------------------------------------
echo.
echo === Validation tests ===
cd /d "%ROOT%"
rem errorlevel after a pipe belongs to findstr, not node: go through
rem a temporary file to test node's REAL exit code.
call node --test test/ > "%TEMP%\stas-install-test.log" 2>&1
if errorlevel 1 (
  echo [warning] some tests failed:
) else (
  echo [ok] test suite is green
)
rem summary in pure cmd (for /f) - no external tool required
for /f "usebackq delims=" %%l in ("%TEMP%\stas-install-test.log") do (
  set "L=%%l"
  if "!L:~0,7!"=="# tests" echo %%l
  if "!L:~0,6!"=="# pass" echo %%l
  if "!L:~0,6!"=="# fail" echo %%l
)
del "%TEMP%\stas-install-test.log" >nul 2>nul

rem --- End -------------------------------------------------------------------
echo.
echo === Installation complete ===
echo.
echo Open a NEW terminal ^(so the PATH is picked up^), then:
echo.
echo   stas                        interactive STAS^> console
echo   stas examples:hello.bas     run a demo
echo   stas run mygame.bas         run a program
echo   stas --edit mygame.bas      edit in the console
echo   stas --web                  server + browser
echo   stas serve                  web server only
echo   stas help                   full help
echo.
endlocal
