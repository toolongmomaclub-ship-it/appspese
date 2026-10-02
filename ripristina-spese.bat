@echo off
rem ---------------------------------------------------------------
rem  ripristina-spese.bat
rem  Doppio click per ripristinare i dati da un backup.
rem  Per usare l'ultimo backup:  ripristina-spese.bat -Ultimo
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo Ripristino dati SPESE
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ripristina-spese.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
echo   Terminato ^(codice %RC%^).
echo.
pause
endlocal
exit /b %RC%
