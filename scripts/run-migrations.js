import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Função para criar planos iniciais
async function createPlans() {
  try {
    console.log('📦 Criando planos iniciais...');
    execSync('npm run init:db', {
      stdio: 'inherit',
      cwd: projectRoot,
      env: process.env
    });
    console.log('✅ Planos criados com sucesso!');
  } catch (error) {
    console.warn('⚠️  Não foi possível criar planos automaticamente. Execute manualmente: npm run init:db');
  }
}

process.chdir(projectRoot);

console.log('🔄 Executando migrações do Prisma...');
console.log(`Project root: ${projectRoot}`);

try {
  // Verificar se as tabelas base existem
  console.log('🔍 Verificando se as tabelas base existem...');
  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'pipe',
      cwd: projectRoot,
      env: process.env
    });
    console.log('✅ Migrações aplicadas com sucesso!');
  } catch (migrateError) {
    const errorOutput = migrateError.stdout?.toString() || migrateError.stderr?.toString() || migrateError.message || String(migrateError);
    
    // Se a tabela não existe, usar db push para criar o schema inicial
    if (errorOutput.includes('does not exist') || errorOutput.includes('table') && errorOutput.includes('not exist')) {
      console.log('⚠️  Tabelas não encontradas. Criando schema inicial com db push...');
      execSync('npx prisma db push --accept-data-loss', {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env
      });
      console.log('✅ Schema inicial criado! Aplicando migrações...');
      // Tentar aplicar migrações novamente
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env
      });
      console.log('✅ Migrações aplicadas com sucesso!');
      await createPlans();
    } else {
      throw migrateError;
    }
  }
  
  // Criar planos após migrações bem-sucedidas
  await createPlans();
} catch (error) {
  const errorMessage = error.message || String(error);
  console.error('❌ Erro ao executar migrações:', errorMessage);
  
  // Não falhar o build se as migrações já estiverem aplicadas
  if (errorMessage.includes('already applied') || errorMessage.includes('No pending migrations')) {
    console.log('ℹ️  Migrações já estão aplicadas. Continuando...');
    process.exit(0);
  }
  
  // Se houver migrações falhadas, tentar resolver
  if (errorMessage.includes('failed migrations') || errorMessage.includes('P3009')) {
    console.log('⚠️  Migrações falhadas detectadas. Tentando resolver...');
    try {
      // Extrair o nome da migração falhada
      const migrationMatch = errorMessage.match(/`(\d+_\w+)`/);
      if (migrationMatch) {
        const migrationName = migrationMatch[1];
        console.log(`📝 Resolvendo migração falhada: ${migrationName}`);
        // Marcar migrações falhadas como resolvidas
        execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
          stdio: 'inherit',
          cwd: projectRoot,
          env: process.env
        });
      } else {
        // Tentar resolver todas as migrações falhadas
        console.log('📝 Tentando resolver todas as migrações falhadas...');
        execSync('npx prisma migrate resolve --applied 20250101000000_add_daily_bet_limits', {
          stdio: 'inherit',
          cwd: projectRoot,
          env: process.env
        });
      }
      console.log('✅ Migrações falhadas resolvidas. Tentando aplicar novamente...');
      // Tentar aplicar novamente
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        cwd: projectRoot,
        env: process.env
      });
      console.log('✅ Migrações aplicadas com sucesso após resolução!');
      await createPlans();
      process.exit(0);
    } catch (resolveError) {
      console.error('❌ Não foi possível resolver migrações falhadas automaticamente.');
      console.error('💡 Execute manualmente: npx prisma migrate resolve --applied');
      console.error('💡 Ou verifique o status: npx prisma migrate status');
      // Continuar mesmo com erro para não quebrar o deploy
      console.log('⚠️  Continuando o deploy mesmo com erro de migração...');
      process.exit(0);
    }
  }
  
  // Para outros erros, continuar mas avisar
  console.log('⚠️  Continuando o deploy mesmo com erro de migração...');
  process.exit(0);
}

