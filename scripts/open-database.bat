@echo off
echo ========================================
echo   Abrindo Prisma Studio
echo ========================================
echo.
echo Aguarde enquanto o Prisma Studio inicia...
echo.
echo O navegador abrira automaticamente em: http://localhost:5555
echo.
echo Pressione Ctrl+C para fechar o Prisma Studio
echo.

cd /d "%~dp0.."
call npm run prisma:studio

pause

