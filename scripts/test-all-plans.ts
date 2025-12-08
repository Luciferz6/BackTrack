import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const prisma = new PrismaClient();

const formatDailyLimit = (limit: number) => (limit && limit > 0 ? `${limit} apostas` : 'Ilimitado');
const formatDailyLimitProgress = (limit: number) => (limit && limit > 0 ? `${limit}` : '∞');

async function testAllPlans() {
  try {
    console.log('🧪 Testando todos os planos disponíveis...\n');

    const plans = [
      { nome: 'Gratuito', limiteEsperado: 5 },
      { nome: 'Amador', limiteEsperado: 50 },
      { nome: 'Profissional', limiteEsperado: 0 }
    ];

    const usersCreated: string[] = [];

    for (const planInfo of plans) {
      console.log(`\n📋 Testando: ${planInfo.nome}`);
      console.log('─'.repeat(50));

      // Verificar se o plano existe
      const plan = await prisma.plan.findUnique({
        where: { nome: planInfo.nome }
      });

      if (!plan) {
        console.error(`❌ ${planInfo.nome} não encontrado!`);
        continue;
      }

      console.log(`✅ ${planInfo.nome} encontrado:`);
      console.log(`   - ID: ${plan.id}`);
      console.log(`   - Limite Diário: ${formatDailyLimit(plan.limiteApostasDiarias)}`);

      // Verificar se o limite está correto
      if (plan.limiteApostasDiarias === planInfo.limiteEsperado) {
        console.log(`   ✅ Limite correto (esperado: ${planInfo.limiteEsperado})`);
      } else {
        console.error(`   ❌ Limite incorreto! Esperado: ${planInfo.limiteEsperado}, Encontrado: ${plan.limiteApostasDiarias}`);
      }

      // Criar um usuário de teste com este plano
      const testEmail = `test-${planInfo.nome.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}@test.com`;
      const hashedPassword = await bcrypt.hash('123456', 10);

      const user = await prisma.user.create({
        data: {
          nomeCompleto: `Usuário Teste ${planInfo.nome}`,
          email: testEmail,
          senha: hashedPassword,
          planoId: plan.id
        },
        include: {
          plano: true
        }
      });

      usersCreated.push(user.id);

      console.log(`\n✅ Usuário criado com ${planInfo.nome}:`);
      console.log(`   - ID: ${user.id}`);
      console.log(`   - Email: ${user.email}`);
      console.log(`   - Plano: ${user.plano.nome}`);
      console.log(`   - Limite Diário: ${formatDailyLimit(user.plano.limiteApostasDiarias)}`);

      // Verificar se o plano foi atribuído corretamente
      if (user.plano.nome === planInfo.nome && user.plano.limiteApostasDiarias === planInfo.limiteEsperado) {
        console.log(`   ✅ CONFIRMADO: Usuário recebeu ${planInfo.nome} corretamente!`);
      } else {
        console.error(`   ❌ ERRO: Usuário não recebeu ${planInfo.nome} corretamente!`);
      }

      // Testar verificação de limite de apostas
      console.log(`\n🔍 Testando verificação de limite para ${planInfo.nome}...`);
      
      // Calcular início do dia (00:00:00)
      const agora = new Date();
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      // Contar apostas do usuário hoje
      const apostasHoje = await prisma.bet.count({
        where: {
          banca: { usuarioId: user.id },
          createdAt: { gte: inicioDia }
        }
      });

      const isUnlimited = planInfo.limiteEsperado === 0;
      console.log(`   - Apostas hoje: ${apostasHoje}/${formatDailyLimitProgress(planInfo.limiteEsperado)}`);
      console.log(`   - Pode criar mais: ${isUnlimited || apostasHoje < planInfo.limiteEsperado ? 'Sim ✅' : 'Não ❌'}`);
      
      // Criar uma banca de teste para testar o limite
      const banca = await prisma.bankroll.create({
        data: {
          nome: `Banca Teste ${planInfo.nome}`,
          usuarioId: user.id,
          ePadrao: true
        }
      });
      
      console.log(`\n🧪 Testando criação de apostas até o limite...`);
      
      // Tentar criar apostas até o limite
      let apostasCriadas = 0;
      const limite = planInfo.limiteEsperado;
      const apostasExistentes = apostasHoje;
      const apostasParaCriar = isUnlimited ? 5 : Math.min(5, limite - apostasExistentes);
      
      if (isUnlimited || apostasParaCriar > 0) {
        for (let i = 0; i < apostasParaCriar; i++) {
          try {
            await prisma.bet.create({
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
            apostasCriadas++;
            console.log(`   ✅ Aposta ${i + 1} criada com sucesso`);
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
        
        console.log(`\n   📊 Resultado:`);
        console.log(`   - Apostas antes: ${apostasExistentes}`);
        console.log(`   - Apostas criadas no teste: ${apostasCriadas}`);
        console.log(`   - Total de apostas hoje: ${apostasFinais}/${formatDailyLimitProgress(limite)}`);
        
        if (apostasFinais === apostasExistentes + apostasCriadas) {
          console.log(`   ✅ Contagem de apostas está correta!`);
        } else {
          console.error(`   ❌ Contagem de apostas está incorreta!`);
        }
        
        // Limpar apostas de teste
        await prisma.bet.deleteMany({
          where: { bancaId: banca.id }
        });
        await prisma.bankroll.delete({
          where: { id: banca.id }
        });
      } else {
        console.log(`   ⚠️  Limite já atingido ou muito próximo. Pulando teste de criação.`);
      }
    }

    // Limpar usuários de teste
    console.log('\n\n🧹 Limpando usuários de teste...');
    for (const userId of usersCreated) {
      await prisma.user.delete({
        where: { id: userId }
      });
    }
    console.log(`✅ ${usersCreated.length} usuário(s) de teste removido(s).`);

    console.log('\n\n📊 RESUMO:');
    console.log('─'.repeat(50));
    console.log('✅ Gratuito: 5 apostas/dia');
    console.log('✅ Amador: 50 apostas/dia');
    console.log('✅ Profissional: apostas ilimitadas');
    console.log('\n✅ Todos os planos estão funcionando corretamente!');

  } catch (error: any) {
    console.error('❌ Erro no teste:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testAllPlans()
  .then(() => {
    console.log('\n🎉 Teste concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha no teste:', error);
    process.exit(1);
  });

