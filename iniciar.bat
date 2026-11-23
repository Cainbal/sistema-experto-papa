@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  Sistema experto difuso - plagas y enfermedades de la papa
echo  ---------------------------------------------------------
echo  Instalando lo necesario (la primera vez tarda unos minutos)...
python -m pip install -q -r requirements.txt
python -m pip install -q -r requirements-camara.txt || echo  (La camara no se pudo instalar: el resto del sistema funciona igual.)
echo.
echo  Abriendo http://localhost:8000 ...
echo  Para abrirlo desde el celular usa el boton "Abrir en el celular" de la pagina.
echo  Para detener el sistema, cierra esta ventana.
echo.
start "" cmd /c "timeout /t 4 > nul & start http://localhost:8000"
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
pause
