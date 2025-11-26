import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function deletePlan() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('📖 Uso: npm run delete-plan <nome-do-plano>');
    console.log('\n📋 Planos existentes:');
    
    const plans = await prisma.plan.findMany({
      select: {
        nome: true,
        limiteApostasDiarias: true,
        usuarios: {
          select: { id: true }
        }
      }
    });
    
    plans.forEach(plan => {
      const userCount = plan.usuarios.length;
      console.log(`   - ${plan.nome} (${plan.limiteApostasDiarias} apostas/dia) - ${userCount} usuário(s)`);
    });
    
    console.log('\n⚠️  ATENÇÃO: Não é possível deletar um plano que tenha usuários associados!');
    process.exit(1);
  }

  const planName = args[0];

  try {
    console.log(`🔄 Verificando plano "${planName}"...\n`);

    // Buscar plano
    const plan = await prisma.plan.findUnique({
      where: { nome: planName },
      include: {
        usuarios: {
          select: {
            id: true,
            nomeCompleto: true,
            email: true
          }
        }
      }
    });

    if (!plan) {
      console.error(`❌ Plano não encontrado: ${planName}`);
      process.exit(1);
    }

    console.log(`✅ Plano encontrado: ${plan.nome}`);
    console.log(`   - ID: ${plan.id}`);
    console.log(`   - Limite Diário: ${plan.limiteApostasDiarias} apostas`);
    console.log(`   - Usuários associados: ${plan.usuarios.length}\n`);

    if (plan.usuarios.length > 0) {
      console.error('❌ Não é possível deletar este plano!');
      console.log('\n📋 Usuários que usam este plano:');
      plan.usuarios.forEach(user => {
        console.log(`   - ${user.nomeCompleto} (${user.email})`);
      });
      console.log('\n💡 Você precisa atribuir outro plano a esses usuários antes de deletar.');
      process.exit(1);
    }

    // Deletar plano
    await prisma.plan.delete({
      where: { id: plan.id }
    });

    console.log(`✅ Plano "${planName}" deletado com sucesso!`);

  } catch (error: any) {
    console.error('❌ Erro ao deletar plano:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deletePlan()
  .then(() => {
    console.log('🎉 Processo concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha:', error);
    process.exit(1);
  });

