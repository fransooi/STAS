@echo off
setlocal EnableDelayedExpansion

rem STAS.bat - quick launcher command for the STAS runtime
rem Usage: STAS [command|file.bas] [parameters...]

rem Locate the batch folder (STAS project root)
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "FIRST=%~1"

rem Help
if /I "%FIRST%"=="help" goto :help
if /I "%FIRST%"=="/?" goto :help

rem Simple subcommands
if /I "%FIRST%"=="test" (
  cd /d "%ROOT%"
  call npm test
  goto :end
)

if /I "%FIRST%"=="serve" (
  call node "%ROOT%\packages\stas-web\serve.js"
  goto :end
)

rem Web mode: STAS --web [--edit file.bas] [--user ...]
for %%a in (%*) do (
  if /I "%%a"=="--web" goto :web
)

rem Local mode (console): build the arguments
rem  - strips the "run" verb if present
rem  - remaps the "examples:" prefix to the absolute examples folder path
set "STRIP=0"
if /I "%FIRST%"=="run" set STRIP=1

set "ARGS="
if "%STRIP%"=="1" shift

:arg_loop
if not "%~1"=="" (
  set "RAW=%~1"
  set "PREFIX=!RAW:~0,9!"
  if /I "!PREFIX!"=="examples:" (
    set "REST=!RAW:~9!"
    set "ARGS=!ARGS! "%ROOT%\examples\!REST!""
  ) else (
    set "ARGS=!ARGS! "%~1""
  )
  shift
  goto :arg_loop
)

if "%STRIP%"=="1" if "%ARGS%"=="" (
  echo [STAS] Usage: STAS run ^<file.bas^> [--config=...]
  exit /b 1
)

call node "%ROOT%\packages\stas-console\bin\stas.js" %ARGS%
goto :end

:web
rem Web mode: delegates to a Node launcher that starts the server
rem and opens the browser with the right URL parameters.
call node "%ROOT%\packages\stas-web\bin\launch.js" %*
goto :end

:help
echo.
echo STAS - STOS ASCII System
echo.
echo Usage:
echo   STAS                              Start the interactive STAS console
echo   STAS ^<file.bas^|examples:name^>    Run a STOS BASIC program
echo   STAS run ^<file.bas^|examples:name^>
echo                                   Run explicitly
echo   STAS --edit ^<file.bas^>          Edit in the console
echo   STAS --web --edit ^<file.bas^>   Edit in the browser
echo   STAS --web --run ^<file.bas^>    Run in the browser
echo   STAS --web                        Start the web server and open the browser
echo   STAS serve                        Start the web server (no browser)
echo   STAS test                         Run the tests
echo   STAS help                         Show this help
echo.
echo Options:
echo   --renderer=aalib^|pixel^|atari^|canvas
echo                                    (web) renderer ; defaut via --web : pixel
echo   --config=^<f.ini^>               INI config ([console] / [web])
echo   --user=^<nom^>                   (web) user name
 echo   --mem=compatible^|native         memory model for screens (def. compatible)
echo   Web resolutions (URL or INI [web]) : res=WxH  text=WxH  gfx=WxH
echo   Console (INI [console])            : screen=WxH  resize=fixed^|follow
echo.
echo Examples:
echo   STAS examples:hello.bas
echo   STAS run examples:sinus-anim.bas
echo   STAS --edit mygame.bas
echo   STAS --web --edit examples:hello.bas
echo   STAS serve
echo.
goto :end

:end
endlocal
