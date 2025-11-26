import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function addTelegramIdField() {
  try {
    console.log('🔄 Adicionando campo telegramId à tabela users...');

    // Usar Prisma para executar SQL direto
    await prisma.$executeRaw`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "telegramId" TEXT;
    `;

    console.log('✅ Campo telegramId adicionado com sucesso!');

    // Adicionar índice único se não existir
    try {
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "users_telegramId_key" ON "users"("telegramId") WHERE "telegramId" IS NOT NULL;
      `;
      console.log('✅ Índice único criado para telegramId!');
    } catch (error: any) {
      // Se o índice já existir, não é problema
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log('ℹ️  Índice único já existe');
    }

    console.log('\n✅ Migração concluída!');
    console.log('📝 O campo telegramId agora está disponível no modelo User');
    console.log('💡 Execute: npm run prisma:generate para atualizar o Prisma Client');
  } catch (error: any) {
    console.error('❌ Erro ao adicionar campo telegramId:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addTelegramIdField();

