@echo off
rem ---------------------------------------------------------------
rem  aggiorna-spese.bat
rem  Doppio click su questo file per fare backup dei dati e
rem  aggiornare l'app SPESE.
rem
rem  Fa da lanciatore per aggiorna-spese.ps1, cosi' non devi
rem  cambiare nessuna impostazione di PowerShell.
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo Avvio aggiornamento SPESE...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0aggiorna-spese.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
    echo   Lo script si e' fermato con un errore ^(codice %RC%^).
    echo   I dati NON sono stati toccati. Leggi il messaggio qui sopra.
) else (
    echo   Aggiornamento terminato.
)

echo.
pause
endlocal
exit /b %RC%
