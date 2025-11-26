import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('Generating Prisma Client...');
console.log('Project root:', projectRoot);

// Verifica se o Prisma está instalado
const prismaPath = join(projectRoot, 'node_modules', 'prisma', 'package.json');
if (!existsSync(prismaPath)) {
  console.error('Prisma not found in node_modules. Please run: npm install');
  process.exit(1);
}

// Tenta diferentes métodos
const methods = [
  // Método 1: Usar node para executar o binário do Prisma diretamente
  () => {
    const prismaBin = join(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(prismaBin)) {
      console.log('Trying method 1: Direct node execution...');
      execSync(`node "${prismaBin}" generate`, {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env
      });
      return true;
    }
    return false;
  },
  // Método 2: Usar npx com caminho completo
  () => {
    console.log('Trying method 2: npx with full path...');
    try {
      execSync('npx --yes prisma generate', {
        cwd: projectRoot,
        stdio: 'inherit',
        env: { ...process.env, PATH: process.env.PATH || '' }
      });
      return true;
    } catch (e) {
      return false;
    }
  },
  // Método 3: Usar npm exec
  () => {
    console.log('Trying method 3: npm exec...');
    try {
      execSync('npm exec -- prisma generate', {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env
      });
      return true;
    } catch (e) {
      return false;
    }
  }
];

let success = false;
for (const method of methods) {
  try {
    if (method()) {
      success = true;
      break;
    }
  } catch (error) {
    console.log(`Method failed: ${error.message}`);
    continue;
  }
}

if (!success) {
  console.error('All methods failed to generate Prisma Client');
  console.error('Please ensure Prisma is installed: npm install');
  process.exit(1);
}

console.log('Prisma Client generated successfully!');

