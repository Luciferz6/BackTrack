@echo off
title Ver IDs dos Usuários para Filtrar
color 0E

echo.
echo ========================================
echo   IDs DOS USUÁRIOS
echo ========================================
echo.
echo Este script mostra os IDs de todos os
echo usuários para você usar como filtro
echo no Prisma Studio.
echo.
echo ========================================
echo.

cd /d "%~dp0"
call npm run db:user-ids

echo.
pause

