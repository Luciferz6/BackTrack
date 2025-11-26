import { prisma } from './prisma-helper.js';

async function assignPlan() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('📖 Uso: npm run assign-plan <email-do-usuario> <nome-do-plano>');
    console.log('\n📋 Planos disponíveis:');
    console.log('   - Gratuito (10 apostas/dia)');
    console.log('   - Iniciante (60 apostas/dia)');
    console.log('   - Profissional (300 apostas/dia)');
    console.log('\n💡 Exemplo: npm run assign-plan usuario@email.com Iniciante');
    process.exit(1);
  }

  const [userEmail, planName] = args;

  try {
    console.log(`🔄 Atribuindo plano "${planName}" ao usuário "${userEmail}"...\n`);

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      include: { plano: true }
    });

    if (!user) {
      console.error(`❌ Usuário não encontrado: ${userEmail}`);
      process.exit(1);
    }

    console.log(`✅ Usuário encontrado: ${user.nomeCompleto}`);
    console.log(`   Plano atual: ${user.plano.nome} (${user.plano.limiteApostasDiarias} apostas/dia)\n`);

    // Buscar plano
    const plan = await prisma.plan.findUnique({
      where: { nome: planName }
    });

    if (!plan) {
      console.error(`❌ Plano não encontrado: ${planName}`);
      console.log('\n📋 Planos disponíveis:');
      const allPlans = await prisma.plan.findMany({
        select: { nome: true, limiteApostasDiarias: true }
      });
      allPlans.forEach(p => {
        console.log(`   - ${p.nome} (${p.limiteApostasDiarias} apostas/dia)`);
      });
      process.exit(1);
    }

    // Atualizar plano do usuário
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { planoId: plan.id },
      include: { plano: true }
    });

    console.log(`✅ Plano atualizado com sucesso!`);
    console.log(`   Novo plano: ${updated.plano.nome}`);
    console.log(`   Limite diário: ${updated.plano.limiteApostasDiarias} apostas\n`);

  } catch (error: any) {
    console.error('❌ Erro ao atribuir plano:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

assignPlan()
  .then(() => {
    console.log('🎉 Processo concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha:', error);
    process.exit(1);
  });

