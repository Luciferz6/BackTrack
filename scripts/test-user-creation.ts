import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();

async function testUserCreation() {
  try {
    console.log('🧪 Testando criação de usuário com Plano Gratuito...\n');

    // Verificar se o Plano Gratuito existe
    const freePlan = await prisma.plan.findUnique({
      where: { nome: 'Gratuito' }
    });

    if (!freePlan) {
      console.error('❌ Plano Gratuito não encontrado!');
      console.log('💡 Execute: npm run init:db');
      return;
    }

    console.log('✅ Plano Gratuito encontrado:');
    console.log(`   - ID: ${freePlan.id}`);
    console.log(`   - Nome: ${freePlan.nome}`);
    console.log(`   - Limite Diário: ${freePlan.limiteApostasDiarias} apostas\n`);

    // Criar um usuário de teste
    const testEmail = `test-${Date.now()}@test.com`;
    const hashedPassword = await bcrypt.hash('123456', 10);

    const user = await prisma.user.create({
      data: {
        nomeCompleto: 'Usuário Teste',
        email: testEmail,
        senha: hashedPassword,
        planoId: freePlan.id
      },
      include: {
        plano: true
      }
    });

    console.log('✅ Usuário criado com sucesso:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Nome: ${user.nomeCompleto}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Plano: ${user.plano.nome}`);
    console.log(`   - Limite Diário: ${user.plano.limiteApostasDiarias} apostas\n`);

    // Verificar se o plano está correto
    if (user.plano.nome === 'Gratuito' && user.plano.limiteApostasDiarias === 5) {
      console.log('✅ CONFIRMADO: Usuário recebeu o Plano Gratuito corretamente!');
    } else {
      console.error('❌ ERRO: Usuário não recebeu o Plano Gratuito corretamente!');
    }

    // Limpar usuário de teste
    await prisma.user.delete({
      where: { id: user.id }
    });
    console.log('\n🧹 Usuário de teste removido.');

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testUserCreation()
  .then(() => {
    console.log('\n🎉 Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha no teste:', error);
    process.exit(1);
  });

