import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não está definido. Configure o arquivo .env antes de continuar.');
  }

  const migrationsPath = path.join(process.cwd(), 'prisma', 'migrations');
  const hasMigrations =
    existsSync(migrationsPath) && readdirSync(migrationsPath).length > 0;

  if (hasMigrations) {
    console.log('> Aplicando migrações pendentes (prisma migrate deploy)...');
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    } catch (error) {
      console.error('Falha ao aplicar migrações. Verifique o log acima.');
      throw error;
    }
  } else {
    console.log(
      '> Nenhuma migração encontrada. Executando prisma db push para sincronizar o schema...'
    );
    try {
      execSync('npx prisma db push', { stdio: 'inherit' });
    } catch (error) {
      console.error('Falha ao sincronizar o schema. Verifique o log acima.');
      throw error;
    }
  }

  // Criar pool de conexões PostgreSQL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Criar adaptador do Prisma para PostgreSQL
  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
  });
  try {
    console.log('> Criando planos...');
    
    // Plano Gratuito - 10 apostas por dia
    await prisma.plan.upsert({
      where: { nome: 'Gratuito' },
      update: {
        preco: 0,
        limiteApostasDiarias: 10
      },
      create: {
        nome: 'Gratuito',
        preco: 0,
        limiteApostasDiarias: 10
      }
    });
    console.log('✓ Plano Gratuito criado (10 apostas/dia - R$ 0,00)');

    // Plano Iniciante - 60 apostas por dia
    await prisma.plan.upsert({
      where: { nome: 'Iniciante' },
      update: {
        preco: 39.99,
        limiteApostasDiarias: 60
      },
      create: {
        nome: 'Iniciante',
        preco: 39.99,
        limiteApostasDiarias: 60
      }
    });
    console.log('✓ Plano Iniciante criado (60 apostas/dia - R$ 39,99)');

    // Plano Profissional - 300 apostas por dia
    await prisma.plan.upsert({
      where: { nome: 'Profissional' },
      update: {
        preco: 59.99,
        limiteApostasDiarias: 300
      },
      create: {
        nome: 'Profissional',
        preco: 59.99,
        limiteApostasDiarias: 300
      }
    });
    console.log('✓ Plano Profissional criado (300 apostas/dia - R$ 59,99)');
    
    console.log('Todos os planos criados com sucesso!');
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('Inicialização concluída com sucesso.');
  })
  .catch((error) => {
    console.error('Erro ao inicializar o banco de dados:', error);
    process.exit(1);
  });

