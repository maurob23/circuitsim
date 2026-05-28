@echo off
cd /d C:\Users\bma20\PycharmProjects\circuitsim
echo Starting CircuitSim server...
echo Working directory: %CD%
echo.
.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload
echo.
echo Server stopped. Press any key to close this window.
pause >nul
