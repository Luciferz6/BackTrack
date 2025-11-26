import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function createTipstersTable() {
  try {
    console.log('🔄 Criando tabela tipsters...');

    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "tipsters" (
        "id" TEXT NOT NULL,
        "usuarioId" TEXT NOT NULL,
        "nome" TEXT NOT NULL,
        "ativo" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "tipsters_pkey" PRIMARY KEY ("id")
      );
    `;

    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "tipsters_usuarioId_nome_key" 
      ON "tipsters"("usuarioId", "nome");
    `;

    await prisma.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'tipsters_usuarioId_fkey'
        ) THEN
          ALTER TABLE "tipsters" 
          ADD CONSTRAINT "tipsters_usuarioId_fkey" 
          FOREIGN KEY ("usuarioId") 
          REFERENCES "users"("id") 
          ON DELETE CASCADE 
          ON UPDATE CASCADE;
        END IF;
      END $$;
    `;

    console.log('✅ Tabela tipsters criada com sucesso!');
  } catch (error: any) {
    console.error('❌ Erro ao criar tabela:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTipstersTable()
  .then(() => {
    console.log('🎉 Processo finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

