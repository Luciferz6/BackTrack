import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function migratePlanLimits() {
  try {
    console.log('🔄 Iniciando migração de limites de planos...');

    // Verificar se a coluna antiga existe
    const plans = await prisma.$queryRaw<Array<{ limiteApostas?: number }>>`
      SELECT "limiteApostas" FROM "plans" LIMIT 1
    `.catch(() => []);

    if (plans.length > 0 && plans[0].limiteApostas !== undefined) {
      console.log('📊 Encontrada coluna limiteApostas. Migrando dados...');

      // Adicionar nova coluna se não existir
      await prisma.$executeRaw`
        ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "limiteApostasDiarias" INTEGER NOT NULL DEFAULT 0
      `;

      // Copiar dados
      await prisma.$executeRaw`
        UPDATE "plans" 
        SET "limiteApostasDiarias" = COALESCE("limiteApostas", 0)
        WHERE "limiteApostasDiarias" = 0
      `;

      console.log('✅ Dados migrados com sucesso!');

      // Remover coluna antiga
      await prisma.$executeRaw`
        ALTER TABLE "plans" DROP COLUMN IF EXISTS "limiteApostas"
      `;

      console.log('✅ Coluna antiga removida!');
    } else {
      console.log('ℹ️  Coluna limiteApostas não encontrada. Apenas adicionando nova coluna...');
      
      // Apenas adicionar a nova coluna
      await prisma.$executeRaw`
        ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "limiteApostasDiarias" INTEGER NOT NULL DEFAULT 0
      `;

      // Remover coluna antiga se existir
      await prisma.$executeRaw`
        ALTER TABLE "plans" DROP COLUMN IF EXISTS "limiteApostas"
      `;
    }

    console.log('✅ Migração concluída com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro durante a migração:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migratePlanLimits()
  .then(() => {
    console.log('🎉 Processo finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha na migração:', error);
    process.exit(1);
  });

