@echo off
echo Iniciando Unika Backend...
cd /d "%~dp0"

REM Activar virtualenv si existe
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

REM Instalar dependencias si no están instaladas
python -c "import fastapi" 2>nul || (
    echo Instalando dependencias Python...
    pip install -r requirements.txt
)

REM Iniciar backend
python backend/server.py
