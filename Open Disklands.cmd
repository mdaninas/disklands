@echo off
cd /d "%~dp0"
if exist "release\Disklands-1.3.0-Windows.exe" (
    start "" "release\Disklands-1.3.0-Windows.exe"
    exit /b
)
if not exist "node_modules\electron\dist\electron.exe" (
    echo Disklands is not built yet. Run npm install and npm run package.
    pause
    exit /b 1
)
if not exist "dist\index.html" call npm.cmd run build
set ELECTRON_RUN_AS_NODE=
start "" "node_modules\electron\dist\electron.exe" .
