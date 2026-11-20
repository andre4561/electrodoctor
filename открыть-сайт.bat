@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python не найден. Установите Python 3 и отметьте "Add to PATH".
  pause
  exit /b 1
)

python -c "import markdown" 2>nul
if errorlevel 1 (
  echo Ставлю пакет markdown...
  python -m pip install markdown
  if errorlevel 1 (
    echo Не удалось установить markdown. Выполните: pip install markdown
    pause
    exit /b 1
  )
)

start "" "http://localhost:8000/"
echo Сервер запущен. Окно не закрывайте — пока оно открыто, сайт доступен.
echo Остановка: Ctrl+C или закрыть это окно.
echo.
python tools/preview.py
pause
