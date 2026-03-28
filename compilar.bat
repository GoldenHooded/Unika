@echo off
setlocal enabledelayedexpansion
title Unika - Compilacion

echo.
echo ========================================
echo   COMPILANDO UNIKA
echo ========================================
echo.

set "ROOT=%~dp0"
set "FRONTEND=%ROOT%frontend"
set "BACKEND=%ROOT%backend"
set "DESKTOP=%USERPROFILE%\Desktop"
set "DEST_DIR=%DESKTOP%\Unika App"

if not exist "%FRONTEND%\package.json" (
    echo [ERROR] No se encuentra frontend\package.json
    echo         Ejecuta este bat desde la carpeta raiz de Unika.
    pause
    exit /b 1
)

:: ── PASO 1: Backend con PyInstaller (onedir) ──────────────────────────────────
echo [1/4] Compilando backend Python con PyInstaller...

python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo   PyInstaller no encontrado. Instalando...
    python -m pip install pyinstaller --quiet
    if errorlevel 1 (
        echo [ERROR] No se pudo instalar PyInstaller. Asegurate de tener Python en el PATH.
        pause
        exit /b 1
    )
)

cd /d "%BACKEND%"
if exist "dist\unika-agent" rmdir /s /q "dist\unika-agent" 2>nul
if exist "build"             rmdir /s /q "build"             2>nul

python -m PyInstaller backend.spec --noconfirm
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo la compilacion del backend con PyInstaller.
    pause
    exit /b 1
)

if not exist "%BACKEND%\dist\unika-agent\unika-agent.exe" (
    echo [ERROR] dist\unika-agent\unika-agent.exe no generado.
    pause
    exit /b 1
)
echo   OK - unika-agent generado en %BACKEND%\dist\unika-agent\
echo.

:: ── PASO 2: Dependencias npm ──────────────────────────────────────────────────
cd /d "%FRONTEND%"
echo [2/4] Instalando dependencias npm...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
)
:: Verificar que el paquete critico esta instalado
if not exist "%FRONTEND%\node_modules\@tailwindcss\typography" (
    echo   Instalando @tailwindcss/typography...
    call npm install @tailwindcss/typography --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] No se pudo instalar @tailwindcss/typography
        pause
        exit /b 1
    )
)
echo.

:: ── PASO 3: Build frontend ────────────────────────────────────────────────────
echo [3/4] Compilando frontend con electron-vite...
call npx electron-vite build
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo la compilacion de Vite/TypeScript.
    pause
    exit /b 1
)
echo.

:: ── PASO 4: Empaquetar con electron-builder (dir = carpeta, sin extraccion) ───
echo [4/4] Empaquetando con electron-builder...
set CSC_IDENTITY_AUTO_DISCOVERY=false
set CSC_LINK=
set WIN_CSC_LINK=

:: Pre-extraer cache winCodeSign para evitar error de symlinks de macOS.
set "SIGN_CACHE=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
set "SEVENZIP=%FRONTEND%\node_modules\7zip-bin\win\x64\7za.exe"
if exist "%SEVENZIP%" (
    if exist "%SIGN_CACHE%" (
        for %%Z in ("%SIGN_CACHE%\*.7z") do (
            set "_ARC=%%Z"
            set "_DEST=%%~dpnZ"
            if not exist "!_DEST!" (
                echo   Pre-extrayendo winCodeSign cache...
                "!SEVENZIP!" x "!_ARC!" "-o!_DEST!" -y >nul 2>&1
                if not exist "!_DEST!\darwin\10.12\lib\" mkdir "!_DEST!\darwin\10.12\lib" 2>nul
                if not exist "!_DEST!\darwin\10.12\lib\libcrypto.dylib" echo n/a>"!_DEST!\darwin\10.12\lib\libcrypto.dylib"
                if not exist "!_DEST!\darwin\10.12\lib\libssl.dylib"   echo n/a>"!_DEST!\darwin\10.12\lib\libssl.dylib"
                echo   Cache OK.
            )
        )
    )
)

call npx electron-builder --win dir --publish never
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo el empaquetado con electron-builder.
    pause
    exit /b 1
)
echo.

:: ── Copiar carpeta al escritorio ───────────────────────────────────────────────
:: electron-builder --win dir genera release\win-unpacked\
set "SRC=%FRONTEND%\release\win-unpacked"
if not exist "%SRC%\Unika.exe" (
    echo [ERROR] No se encontro %SRC%\Unika.exe
    pause
    exit /b 1
)

:: Proteccion: nunca borrar la carpeta del propio proyecto
if /i "%DEST_DIR%"=="%ROOT:~0,-1%" (
    echo [ERROR] DEST_DIR coincide con la carpeta del proyecto. Abortando.
    pause
    exit /b 1
)

echo Copiando al escritorio...
if exist "%DEST_DIR%" rmdir /s /q "%DEST_DIR%"
xcopy /e /i /q "%SRC%" "%DEST_DIR%" >nul
if errorlevel 1 (
    echo [ERROR] No se pudo copiar a %DEST_DIR%
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Compilacion completada!
echo ========================================
echo.
echo   Carpeta: %DEST_DIR%
echo   Ejecutar: %DEST_DIR%\Unika.exe
echo.
echo La carpeta Unika\ es portable: copiala
echo donde quieras y ejecuta Unika.exe
echo No requiere instalacion ni Python.
echo.

set /p OPEN=Abrir Unika ahora? (s/n):
if /i "!OPEN!"=="s" start "" "%DEST_DIR%\Unika.exe"

endlocal
pause
