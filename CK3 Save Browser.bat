@echo off
cd /d "%~dp0"

echo ========================================
echo        CK3 Save Browser Launcher
echo ========================================
echo.

echo Starting CK3 Save Browser...
echo.

python -m ck3_browser
if %errorlevel% neq 0 (
    echo.
    echo python failed, trying python3...
    echo.
    python3 -m ck3_browser
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to launch CK3 Save Browser.
        pause
        exit /b 1
    )
)
