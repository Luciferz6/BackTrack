import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function showDatabaseInfo() {
  try {
    console.log('\n========================================');
    console.log('   INFORMAÇÕES DO BANCO DE DADOS');
    console.log('========================================\n');

    // Testar conexão
    await prisma.$connect();
    console.log('✅ Conexão com o banco de dados estabelecida!\n');

    // Contar registros em cada tabela
    const [users, plans, bankrolls, bets, transactions, tipsters] = await Promise.all([
      prisma.user.count(),
      prisma.plan.count(),
      prisma.bankroll.count(),
      prisma.bet.count(),
      prisma.financialTransaction.count(),
      prisma.tipster.count()
    ]);

    console.log('📊 ESTATÍSTICAS DO BANCO:\n');
    console.log(`   👥 Usuários:        ${users}`);
    console.log(`   💳 Planos:          ${plans}`);
    console.log(`   💰 Bancas:          ${bankrolls}`);
    console.log(`   🎲 Apostas:         ${bets}`);
    console.log(`   💵 Transações:      ${transactions}`);
    console.log(`   📝 Tipsters:        ${tipsters}`);

    // Listar usuários
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        nomeCompleto: true,
        email: true,
        statusConta: true,
        plano: {
          select: {
            nome: true
          }
        },
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    if (allUsers.length > 0) {
      console.log('\n👥 ÚLTIMOS USUÁRIOS CADASTRADOS:\n');
      allUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.nomeCompleto}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Plano: ${user.plano.nome}`);
        console.log(`      Status: ${user.statusConta}`);
        console.log(`      Criado em: ${new Date(user.createdAt).toLocaleDateString('pt-BR')}`);
        console.log('');
      });
    }

    // Listar planos
    const allPlans = await prisma.plan.findMany({
      select: {
        nome: true,
        preco: true,
        limiteApostasDiarias: true,
        _count: {
          select: {
            usuarios: true
          }
        }
      },
      orderBy: {
        preco: 'asc'
      }
    });

    if (allPlans.length > 0) {
      console.log('💳 PLANOS DISPONÍVEIS:\n');
      allPlans.forEach((plan) => {
        console.log(`   📦 ${plan.nome}`);
        console.log(`      Preço: R$ ${plan.preco.toFixed(2)}`);
        console.log(`      Limite diário: ${plan.limiteApostasDiarias === 0 ? 'Ilimitado' : plan.limiteApostasDiarias} apostas`);
        console.log(`      Usuários: ${plan._count.usuarios}`);
        console.log('');
      });
    }

    console.log('========================================\n');
    console.log('💡 DICA: Use "npm run prisma:studio" para abrir interface visual');
    console.log('   ou execute: node scripts/open-database.bat\n');

  } catch (error) {
    console.error('\n❌ Erro ao acessar o banco de dados:');
    console.error(error.message);
    console.error('\nVerifique:');
    console.error('   1. Se o arquivo .env está configurado');
    console.error('   2. Se a variável DATABASE_URL está correta');
    console.error('   3. Se o banco de dados está acessível\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void showDatabaseInfo();

