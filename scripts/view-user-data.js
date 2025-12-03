import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      nomeCompleto: true,
      email: true,
      statusConta: true,
      plano: {
        select: {
          nome: true,
          preco: true,
          limiteApostasDiarias: true
        }
      },
      membroDesde: true
    },
    orderBy: {
      nomeCompleto: 'asc'
    }
  });

  console.log('\n========================================');
  console.log('   LISTA DE USUÁRIOS');
  console.log('========================================\n');

  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.nomeCompleto}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Plano: ${user.plano.nome}`);
    console.log(`   Status: ${user.statusConta}`);
    console.log('');
  });

  return users;
}

async function showUserDetails(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      plano: true,
      bancas: {
        include: {
          apostas: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          },
          transacoes: {
            orderBy: {
              dataTransacao: 'desc'
            },
            take: 10
          },
          _count: {
            select: {
              apostas: true,
              transacoes: true
            }
          }
        },
        orderBy: {
          criadoEm: 'desc'
        }
      },
      tipsters: {
        orderBy: {
          nome: 'asc'
        }
      },
      _count: {
        select: {
          bancas: true,
          tipsters: true
        }
      }
    }
  });

  if (!user) {
    console.log('\n❌ Usuário não encontrado!\n');
    return;
  }

  // Contar total de apostas e transações
  const totalApostas = user.bancas.reduce((sum, banca) => sum + banca._count.apostas, 0);
  const totalTransacoes = user.bancas.reduce((sum, banca) => sum + banca._count.transacoes, 0);

  console.log('\n');
  console.log('═'.repeat(60));
  console.log(`   👤 USUÁRIO: ${user.nomeCompleto.toUpperCase()}`);
  console.log('═'.repeat(60));
  console.log(`\n📧 Email: ${user.email}`);
  console.log(`📅 Membro desde: ${new Date(user.membroDesde).toLocaleDateString('pt-BR')}`);
  console.log(`✅ Status: ${user.statusConta}`);
  console.log(`🆔 ID: ${user.id}`);
  
  console.log(`\n💳 PLANO:`);
  console.log(`   Nome: ${user.plano.nome}`);
  console.log(`   Preço: R$ ${user.plano.preco.toFixed(2)}`);
  console.log(`   Limite diário: ${user.plano.limiteApostasDiarias === 0 ? 'Ilimitado' : user.plano.limiteApostasDiarias} apostas`);

  if (user.telegramId) {
    console.log(`\n📱 Telegram ID: ${user.telegramId}`);
  }

  console.log(`\n📊 RESUMO:`);
  console.log(`   Bancas: ${user._count.bancas}`);
  console.log(`   Tipsters: ${user._count.tipsters}`);
  console.log(`   Total de Apostas: ${totalApostas}`);
  console.log(`   Total de Transações: ${totalTransacoes}`);

  // BANCAS
  if (user.bancas.length > 0) {
    console.log(`\n💰 BANCAS (${user.bancas.length}):`);
    console.log('─'.repeat(60));
    
    user.bancas.forEach((banca, index) => {
      console.log(`\n   ${index + 1}. ${banca.nome} ${banca.ePadrao ? '(Padrão)' : ''}`);
      console.log(`      ID: ${banca.id}`);
      console.log(`      Status: ${banca.status}`);
      if (banca.descricao) {
        console.log(`      Descrição: ${banca.descricao}`);
      }
      console.log(`      Criada em: ${new Date(banca.criadoEm).toLocaleDateString('pt-BR')}`);
      console.log(`      Apostas: ${banca._count.apostas}`);
      console.log(`      Transações: ${banca._count.transacoes}`);

      // Últimas apostas desta banca
      if (banca.apostas.length > 0) {
        console.log(`\n      🎲 Últimas Apostas:`);
        banca.apostas.forEach((aposta) => {
          console.log(`         • ${aposta.jogo} - ${aposta.status}`);
          console.log(`           Valor: R$ ${aposta.valorApostado.toFixed(2)} | Odd: ${aposta.odd}`);
          console.log(`           Data: ${new Date(aposta.dataJogo).toLocaleDateString('pt-BR')}`);
        });
      }

      // Últimas transações desta banca
      if (banca.transacoes.length > 0) {
        console.log(`\n      💵 Últimas Transações:`);
        banca.transacoes.forEach((transacao) => {
          const sinal = transacao.tipo === 'Depósito' ? '+' : '-';
          console.log(`         • ${transacao.tipo}: R$ ${sinal}${transacao.valor.toFixed(2)}`);
          console.log(`           Casa: ${transacao.casaDeAposta}`);
          console.log(`           Data: ${new Date(transacao.dataTransacao).toLocaleDateString('pt-BR')}`);
        });
      }
    });
  } else {
    console.log(`\n💰 BANCAS: Nenhuma banca cadastrada`);
  }

  // TIPSTERS
  if (user.tipsters.length > 0) {
    console.log(`\n📝 TIPSTERS (${user.tipsters.length}):`);
    console.log('─'.repeat(60));
    user.tipsters.forEach((tipster, index) => {
      console.log(`   ${index + 1}. ${tipster.nome} ${tipster.ativo ? '✅' : '❌'}`);
      console.log(`      ID: ${tipster.id}`);
      console.log(`      Status: ${tipster.ativo ? 'Ativo' : 'Inativo'}`);
    });
  } else {
    console.log(`\n📝 TIPSTERS: Nenhum tipster cadastrado`);
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados!\n');

    while (true) {
      const users = await listUsers();
      
      console.log('0. Sair\n');
      const choice = await question('Escolha um usuário pelo número (ou 0 para sair): ');

      if (choice === '0') {
        console.log('\n👋 Até logo!\n');
        break;
      }

      const userIndex = parseInt(choice) - 1;
      if (userIndex >= 0 && userIndex < users.length) {
        await showUserDetails(users[userIndex].id);
        
        const continueChoice = await question('Pressione Enter para voltar à lista...');
      } else {
        console.log('\n❌ Opção inválida!\n');
      }
    }

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error('\nVerifique:');
    console.error('   1. Se o arquivo .env está configurado');
    console.error('   2. Se a variável DATABASE_URL está correta');
    console.error('   3. Se o banco de dados está acessível\n');
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

void main();

