@echo off
echo Iniciando Unika en modo desarrollo...
cd /d "%~dp0"

REM Activar virtualenv si existe
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

REM Instalar dependencias Python si faltan
python -c "import fastapi" 2>nul || (
    echo Instalando dependencias Python...
    pip install -r requirements.txt
)

REM Instalar dependencias Node si faltan
if not exist "frontend\node_modules" (
    echo Instalando dependencias Node...
    cd frontend
    npm install
    cd ..
)

REM Matar cualquier proceso que tenga el puerto 8765 (sesion anterior de Electron/Python)
echo Liberando puerto 8765...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
timeout /t 1 /nobreak >nul

REM Electron arranca el backend automaticamente (ver electron/main.ts -> startBackend)
echo Iniciando Electron...
cd frontend
npx electron-vite dev
