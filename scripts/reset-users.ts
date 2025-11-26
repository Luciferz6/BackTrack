import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function resetUsers() {
  try {
    console.log('🔄 Iniciando reset do banco de dados de usuários...');

    // Contar usuários antes
    const countBefore = await prisma.user.count();
    console.log(`📊 Usuários encontrados: ${countBefore}`);

    if (countBefore === 0) {
      console.log('ℹ️  Nenhum usuário encontrado no banco de dados.');
      return;
    }

    // Deletar todos os usuários (cascade vai deletar bancas, apostas, etc)
    const result = await prisma.user.deleteMany({});

    console.log(`✅ ${result.count} usuário(s) deletado(s) com sucesso!`);
    console.log('✅ Todas as bancas, apostas e transações relacionadas também foram removidas (cascade).');
    
  } catch (error: any) {
    console.error('❌ Erro ao resetar usuários:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetUsers()
  .then(() => {
    console.log('🎉 Reset concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha no reset:', error);
    process.exit(1);
  });

