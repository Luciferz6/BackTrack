import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function showAllUsersData() {
  try {
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados!\n');

    const users = await prisma.user.findMany({
      include: {
        plano: true,
        bancas: {
          include: {
            apostas: {
              orderBy: {
                createdAt: 'desc'
              }
            },
            transacoes: {
              orderBy: {
                dataTransacao: 'desc'
              }
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
      },
      orderBy: {
        nomeCompleto: 'asc'
      }
    });

    users.forEach((user, userIndex) => {
      // Contar total de apostas e transações
      const totalApostas = user.bancas.reduce((sum, banca) => sum + banca._count.apostas, 0);
      const totalTransacoes = user.bancas.reduce((sum, banca) => sum + banca._count.transacoes, 0);

      console.log('\n');
      console.log('═'.repeat(70));
      console.log(`   👤 USUÁRIO ${userIndex + 1}: ${user.nomeCompleto.toUpperCase()}`);
      console.log('═'.repeat(70));
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
        console.log('─'.repeat(70));
        
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

          // Todas as apostas desta banca
          if (banca.apostas.length > 0) {
            console.log(`\n      🎲 APOSTAS (${banca.apostas.length}):`);
            banca.apostas.forEach((aposta, apostaIndex) => {
              console.log(`\n         ${apostaIndex + 1}. ${aposta.jogo}`);
              console.log(`            Status: ${aposta.status}`);
              console.log(`            Esporte: ${aposta.esporte}`);
              console.log(`            Casa: ${aposta.casaDeAposta}`);
              console.log(`            Valor: R$ ${aposta.valorApostado.toFixed(2)}`);
              console.log(`            Odd: ${aposta.odd}`);
              if (aposta.retornoObtido) {
                console.log(`            Retorno: R$ ${aposta.retornoObtido.toFixed(2)}`);
              }
              console.log(`            Data do jogo: ${new Date(aposta.dataJogo).toLocaleDateString('pt-BR')}`);
              if (aposta.tipster) {
                console.log(`            Tipster: ${aposta.tipster}`);
              }
            });
          }

          // Todas as transações desta banca
          if (banca.transacoes.length > 0) {
            console.log(`\n      💵 TRANSAÇÕES (${banca.transacoes.length}):`);
            banca.transacoes.forEach((transacao, transIndex) => {
              const sinal = transacao.tipo === 'Depósito' ? '+' : '-';
              console.log(`\n         ${transIndex + 1}. ${transacao.tipo}`);
              console.log(`            Valor: R$ ${sinal}${transacao.valor.toFixed(2)}`);
              console.log(`            Casa: ${transacao.casaDeAposta}`);
              console.log(`            Data: ${new Date(transacao.dataTransacao).toLocaleDateString('pt-BR')}`);
              if (transacao.observacao) {
                console.log(`            Observação: ${transacao.observacao}`);
              }
            });
          }
        });
      } else {
        console.log(`\n💰 BANCAS: Nenhuma banca cadastrada`);
      }

      // TIPSTERS
      if (user.tipsters.length > 0) {
        console.log(`\n📝 TIPSTERS (${user.tipsters.length}):`);
        console.log('─'.repeat(70));
        user.tipsters.forEach((tipster, index) => {
          console.log(`   ${index + 1}. ${tipster.nome} ${tipster.ativo ? '✅ Ativo' : '❌ Inativo'}`);
          console.log(`      ID: ${tipster.id}`);
          console.log(`      Criado em: ${new Date(tipster.createdAt).toLocaleDateString('pt-BR')}`);
        });
      } else {
        console.log(`\n📝 TIPSTERS: Nenhum tipster cadastrado`);
      }

      console.log('\n' + '═'.repeat(70));
    });

    console.log(`\n\n✅ Total de usuários: ${users.length}\n`);

  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error('\nVerifique:');
    console.error('   1. Se o arquivo .env está configurado');
    console.error('   2. Se a variável DATABASE_URL está correta');
    console.error('   3. Se o banco de dados está acessível\n');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void showAllUsersData();

