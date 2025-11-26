import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function addCorToBankroll() {
  try {
    console.log('> Adicionando coluna "cor" à tabela bankrolls...');
    
    // Adicionar coluna cor se não existir
    await prisma.$executeRaw`
      ALTER TABLE "bankrolls" 
      ADD COLUMN IF NOT EXISTS "cor" TEXT DEFAULT '#2563eb';
    `;

    console.log('✅ Coluna "cor" adicionada com sucesso à tabela bankrolls');
    console.log('💡 Execute: npm run prisma:generate para atualizar o Prisma Client');
  } catch (error: any) {
    console.error('❌ Erro ao adicionar coluna cor:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addCorToBankroll()
  .then(() => {
    console.log('✅ Script executado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro ao executar script:', error);
    process.exit(1);
  });

