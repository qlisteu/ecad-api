@echo off
echo Killing processes on port 4000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
    echo Killing process %%a
    taskkill /f /pid %%a
)
echo Starting API server...
npm run dev
