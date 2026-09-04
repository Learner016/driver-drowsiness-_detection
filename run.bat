@echo off
cd /d "%~dp0"
echo Starting Driver Drowsiness Detection...
start "" http://localhost:8000/index.html
python -m http.server 8000
pause
