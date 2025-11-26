import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function listUsersWithIds() {
  try {
    await prisma.$connect();
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        plano: {
          select: {
            nome: true
          }
        }
      },
      orderBy: {
        nomeCompleto: 'asc'
      }
    });

    console.log('\n========================================');
    console.log('   IDs DOS USUÁRIOS');
    console.log('========================================\n');
    console.log('Use estes IDs para filtrar no Prisma Studio:\n');

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.nomeCompleto}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Plano: ${user.plano.nome}`);
      console.log(`   ID: ${user.id}`);
      console.log('');
    });

    console.log('========================================\n');
    console.log('💡 DICA:');
    console.log('   1. Copie o ID do usuário acima');
    console.log('   2. No Prisma Studio, vá em "Bankroll"');
    console.log('   3. Na coluna "usuariold", cole o ID');
    console.log('   4. Você verá apenas as bancas daquele usuário!\n');

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void listUsersWithIds();

