import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function createViews() {
  try {
    console.log('📊 Criando views no banco de dados...\n');

    const sqlFile = join(projectRoot, 'prisma', 'migrations', 'create_user_views.sql');
    const sql = readFileSync(sqlFile, 'utf-8');

    // Executar cada statement SQL separadamente
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await prisma.$executeRawUnsafe(statement);
          console.log('✅ View criada com sucesso');
        } catch (error: any) {
          // Ignorar erro se a view já existir
          if (error.message?.includes('already exists')) {
            console.log('⚠️  View já existe, pulando...');
          } else {
            console.error('❌ Erro ao criar view:', error.message);
          }
        }
      }
    }

    console.log('\n✅ Todas as views foram criadas/atualizadas!\n');
    console.log('📋 Views disponíveis:');
    console.log('   1. user_complete_data - Resumo completo de cada usuário');
    console.log('   2. user_bankrolls_summary - Bancas do usuário com resumo');
    console.log('   3. user_bets - Todas as apostas do usuário');
    console.log('   4. user_transactions - Todas as transações do usuário');
    console.log('   5. user_tipsters - Todos os tipsters do usuário');
    console.log('\n💡 No Prisma Studio, você pode filtrar por user_id para ver apenas dados de um usuário específico!\n');

  } catch (error: any) {
    console.error('\n❌ Erro ao criar views:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void createViews();

