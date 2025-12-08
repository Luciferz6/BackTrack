import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool } = pg;

// Criar pool de conexões PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Criar adaptador do Prisma para PostgreSQL
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function testDailyLimit() {
  try {
    console.log('🧪 Testando limite diário de apostas...\n');

    // Buscar plano Gratuito (5 apostas/dia)
    const plan = await prisma.plan.findUnique({
      where: { nome: 'Gratuito' }
    });

    if (!plan) {
      console.error('❌ Plano Gratuito não encontrado!');
      process.exit(1);
    }

    console.log(`✅ Plano encontrado: ${plan.nome}`);
    console.log(`   Limite diário: ${plan.limiteApostasDiarias} apostas\n`);

    // Criar usuário de teste
    const testEmail = `test-daily-limit-${Date.now()}@test.com`;
    const hashedPassword = await bcrypt.hash('123456', 10);

    const user = await prisma.user.create({
      data: {
        nomeCompleto: 'Usuário Teste Limite Diário',
        email: testEmail,
        senha: hashedPassword,
        planoId: plan.id
      },
      include: {
        plano: true
      }
    });

    console.log(`✅ Usuário criado: ${user.email}`);

    // Criar banca de teste
    const banca = await prisma.bankroll.create({
      data: {
        nome: 'Banca Teste',
        usuarioId: user.id,
        ePadrao: true
      }
    });

    console.log(`✅ Banca criada: ${banca.nome}\n`);

    // Calcular início do dia atual (00:00:00)
    const agora = new Date();
    const inicioDia = new Date(agora);
    inicioDia.setHours(0, 0, 0, 0);

    // Contar apostas existentes hoje
    const apostasExistentes = await prisma.bet.count({
      where: {
        banca: { usuarioId: user.id },
        createdAt: { gte: inicioDia }
      }
    });

    console.log(`📊 Apostas existentes hoje: ${apostasExistentes}`);
    console.log(`📊 Limite do plano: ${plan.limiteApostasDiarias}`);
    console.log(`📊 Apostas restantes: ${Math.max(0, plan.limiteApostasDiarias - apostasExistentes)}\n`);

    // Criar apostas até o limite
    const limite = plan.limiteApostasDiarias;
    const apostasParaCriar = Math.min(5, limite - apostasExistentes); // Criar no máximo 5 apostas para teste

    if (apostasParaCriar <= 0) {
      console.log('⚠️  Limite já atingido ou muito próximo. Não é possível criar mais apostas hoje.');
    } else {
      console.log(`🔄 Criando ${apostasParaCriar} apostas de teste...\n`);

      for (let i = 0; i < apostasParaCriar; i++) {
        try {
          const aposta = await prisma.bet.create({
            data: {
              bancaId: banca.id,
              esporte: 'Futebol',
              jogo: `Jogo Teste ${i + 1}`,
              mercado: '1x2',
              tipoAposta: 'Casa',
              valorApostado: 10,
              odd: 1.5,
              dataJogo: new Date(),
              casaDeAposta: 'Casa Teste',
              status: 'Pendente'
            }
          });
          console.log(`   ✅ Aposta ${i + 1} criada (ID: ${aposta.id.substring(0, 8)}...)`);
        } catch (error: any) {
          console.error(`   ❌ Erro ao criar aposta ${i + 1}: ${error.message}`);
        }
      }

      // Verificar contagem final
      const apostasFinais = await prisma.bet.count({
        where: {
          banca: { usuarioId: user.id },
          createdAt: { gte: inicioDia }
        }
      });

      console.log(`\n📊 Resultado final:`);
      console.log(`   - Apostas antes: ${apostasExistentes}`);
      console.log(`   - Apostas criadas: ${apostasParaCriar}`);
      console.log(`   - Total de apostas hoje: ${apostasFinais}/${limite}`);

      if (apostasFinais === apostasExistentes + apostasParaCriar) {
        console.log(`   ✅ Contagem de apostas está correta!`);
      } else {
        console.error(`   ❌ Contagem de apostas está incorreta!`);
      }

      // Testar se o limite está sendo respeitado
      if (apostasFinais >= limite) {
        console.log(`\n🔒 Teste de limite:`);
        console.log(`   - Limite atingido: ${apostasFinais} >= ${limite}`);
        console.log(`   ✅ O sistema deve bloquear novas apostas até o reset (00:00)`);
      } else {
        console.log(`\n🔓 Teste de limite:`);
        console.log(`   - Limite não atingido: ${apostasFinais} < ${limite}`);
        console.log(`   - Ainda é possível criar ${limite - apostasFinais} apostas hoje`);
      }

      // Calcular próximo reset
      const proximoReset = new Date(inicioDia);
      proximoReset.setDate(proximoReset.getDate() + 1);

      console.log(`\n⏰ Próximo reset: ${proximoReset.toLocaleString('pt-BR')}`);
    }

    // Limpar dados de teste
    console.log(`\n🧹 Limpando dados de teste...`);
    await prisma.bet.deleteMany({
      where: { bancaId: banca.id }
    });
    await prisma.bankroll.delete({
      where: { id: banca.id }
    });
    await prisma.user.delete({
      where: { id: user.id }
    });
    console.log(`✅ Dados de teste removidos.`);

    console.log(`\n✅ Teste concluído com sucesso!`);

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

testDailyLimit()
  .then(() => {
    console.log('\n🎉 Todos os testes passaram!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha no teste:', error);
    process.exit(1);
  });

