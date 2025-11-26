import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function renameFreePlan() {
  try {
    console.log('🔄 Renomeando "Plano Gratuito" para "Gratuito"...\n');

    // Buscar o plano antigo
    const oldPlan = await prisma.plan.findUnique({
      where: { nome: 'Plano Gratuito' },
      include: { usuarios: true }
    });

    if (!oldPlan) {
      console.log('ℹ️  Plano "Plano Gratuito" não encontrado.');
      
      // Verificar se já existe "Gratuito"
      const newPlan = await prisma.plan.findUnique({
        where: { nome: 'Gratuito' }
      });

      if (newPlan) {
        console.log('✅ Plano "Gratuito" já existe!');
        return;
      }
      
      console.log('💡 Criando novo plano "Gratuito"...');
      await prisma.plan.create({
        data: {
          nome: 'Gratuito',
          preco: 0,
          limiteApostasDiarias: 50
        }
      });
      console.log('✅ Plano "Gratuito" criado!');
      return;
    }

    // Verificar se já existe "Gratuito"
    const existingGratuito = await prisma.plan.findUnique({
      where: { nome: 'Gratuito' }
    });

    if (existingGratuito) {
      console.log('⚠️  Plano "Gratuito" já existe!');
      console.log('📋 Migrando usuários de "Plano Gratuito" para "Gratuito"...');
      
      // Migrar usuários
      if (oldPlan.usuarios.length > 0) {
        await prisma.user.updateMany({
          where: { planoId: oldPlan.id },
          data: { planoId: existingGratuito.id }
        });
        console.log(`✅ ${oldPlan.usuarios.length} usuário(s) migrado(s)!`);
      }
      
      // Deletar plano antigo
      await prisma.plan.delete({
        where: { id: oldPlan.id }
      });
      console.log('✅ Plano antigo "Plano Gratuito" deletado!');
    } else {
      // Renomear o plano
      await prisma.plan.update({
        where: { id: oldPlan.id },
        data: { nome: 'Gratuito' }
      });
      console.log('✅ Plano renomeado com sucesso!');
    }

    console.log('\n✅ Processo concluído!');

  } catch (error: any) {
    console.error('❌ Erro ao renomear plano:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

renameFreePlan()
  .then(() => {
    console.log('🎉 Renomeação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha:', error);
    process.exit(1);
  });

