@echo off
echo ========================================
echo   Iniciando Prisma Studio
echo ========================================
echo.
echo Prisma Studio sera aberto em: http://localhost:5555
echo.
echo Pressione Ctrl+C para parar o servidor
echo.

cd /d "%~dp0"
npm run prisma:studio

pause

