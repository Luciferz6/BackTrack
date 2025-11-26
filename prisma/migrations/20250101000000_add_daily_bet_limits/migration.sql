-- AlterTable: Adicionar limiteApostasDiarias
-- Adicionar a nova coluna (sem depender da coluna antiga que pode não existir)
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "limiteApostasDiarias" INTEGER NOT NULL DEFAULT 0;

-- Se a coluna antiga existir, copiar os dados
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'plans' AND column_name = 'limiteApostas') THEN
        UPDATE "plans" 
        SET "limiteApostasDiarias" = COALESCE("limiteApostas", 0)
        WHERE "limiteApostasDiarias" = 0;
        
        ALTER TABLE "plans" DROP COLUMN IF EXISTS "limiteApostas";
    END IF;
END $$;

