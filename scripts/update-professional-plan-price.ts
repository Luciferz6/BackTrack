import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function updateProfessionalPlanPrice() {
  try {
    console.log('🟣 Atualizando preço do plano Profissional...');

    const existing = await prisma.plan.findUnique({ where: { nome: 'Profissional' } });
    if (!existing) {
      console.log('⚠️  Plano Profissional não existe. Criando com os valores atuais...');
      const created = await prisma.plan.create({
        data: {
          nome: 'Profissional',
          preco: 89.99,
          limiteApostasDiarias: 0,
        },
      });
      console.log('✅ Plano Profissional criado:', {
        id: created.id,
        preco: created.preco,
        limite: created.limiteApostasDiarias,
      });
      return;
    }

    if (existing.preco === 89.99 && existing.limiteApostasDiarias === 0) {
      console.log('ℹ️  Plano Profissional já está configurado com o preço correto.');
      return;
    }

    const updated = await prisma.plan.update({
      where: { id: existing.id },
      data: {
        preco: 89.99,
        limiteApostasDiarias: 0,
      },
    });

    console.log('✅ Plano Profissional atualizado com sucesso:', {
      id: updated.id,
      precoAnterior: existing.preco,
      precoAtual: updated.preco,
      limiteAtual: updated.limiteApostasDiarias,
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar o plano Profissional:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

updateProfessionalPlanPrice()
  .then(() => {
    if (!process.exitCode) {
      console.log('🏁 Processo concluído.');
    }
  })
  .catch((error) => {
    console.error('💥 Falha ao atualizar o plano:', error);
    process.exitCode = 1;
  });
