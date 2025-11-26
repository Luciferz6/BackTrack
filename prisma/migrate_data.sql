-- Script de migração de dados: limiteApostas -> limiteApostasDiarias
-- Execute este script no seu banco de dados PostgreSQL antes de usar prisma db push

-- 1. Adicionar a nova coluna se não existir
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "limiteApostasDiarias" INTEGER NOT NULL DEFAULT 0;

-- 2. Copiar dados da coluna antiga para a nova
UPDATE "plans" 
SET "limiteApostasDiarias" = COALESCE("limiteApostas", 0)
WHERE "limiteApostasDiarias" = 0 AND "limiteApostas" IS NOT NULL;

-- 3. Remover a coluna antiga
ALTER TABLE "plans" DROP COLUMN IF EXISTS "limiteApostas";

