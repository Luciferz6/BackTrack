@echo off
title Abrir Banco de Dados - Prisma Studio
color 0A

echo.
echo ========================================
echo   ABRINDO PRISMA STUDIO
echo ========================================
echo.
echo Este script vai abrir o Prisma Studio,
echo uma interface visual para gerenciar
echo seu banco de dados.
echo.
echo O navegador abrira automaticamente em:
echo    http://localhost:5555
echo.
echo Para fechar, pressione Ctrl+C no terminal
echo.
echo ========================================
echo.

cd /d "%~dp0"
call npm run db:open

pause

