import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

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

  const prisma = new PrismaClient();
  try {
    console.log('> Criando planos...');

    const existingAmador = await prisma.plan.findUnique({ where: { nome: 'Amador' } });
    if (!existingAmador) {
      const legacyIniciante = await prisma.plan.findUnique({ where: { nome: 'Iniciante' } });
      if (legacyIniciante) {
        console.log('> Renomeando plano "Iniciante" para "Amador"...');
        await prisma.plan.update({
          where: { id: legacyIniciante.id },
          data: { nome: 'Amador' }
        });
      }
    }
    
    // Plano Gratuito - 5 apostas por dia
    await prisma.plan.upsert({
      where: { nome: 'Gratuito' },
      update: {
        preco: 0,
        limiteApostasDiarias: 5
      },
      create: {
        nome: 'Gratuito',
        preco: 0,
        limiteApostasDiarias: 5
      }
    });
    console.log('✓ Plano Gratuito criado (5 apostas/dia - R$ 0,00)');

    // Plano Amador - 50 apostas por dia
    await prisma.plan.upsert({
      where: { nome: 'Amador' },
      update: {
        preco: 49.99,
        limiteApostasDiarias: 50
      },
      create: {
        nome: 'Amador',
        preco: 49.99,
        limiteApostasDiarias: 50
      }
    });
    console.log('✓ Plano Amador criado (50 apostas/dia - R$ 49,99)');

    // Plano Profissional - apostas ilimitadas
    await prisma.plan.upsert({
      where: { nome: 'Profissional' },
      update: {
        preco: 89.99,
        limiteApostasDiarias: 0
      },
      create: {
        nome: 'Profissional',
        preco: 89.99,
        limiteApostasDiarias: 0
      }
    });
    console.log('✓ Plano Profissional criado (apostas ilimitadas - R$ 89,99)');
    
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

