@echo off
cd /d "%~dp0"
if not exist "emr\kid\node_modules" call npm run setup
start "" http://localhost:5173/emr/kid/
call npm run dev
