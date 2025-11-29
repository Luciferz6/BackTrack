import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from 'dotenv';
// Carregar variáveis de ambiente
config();
const { Pool } = pg;
// Singleton do Prisma Client para evitar múltiplas instâncias
const globalForPrisma = globalThis;
// Validar DATABASE_URL
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não está definida. Verifique seu arquivo .env');
}
// Criar pool de conexões PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});
// Criar adaptador do Prisma para PostgreSQL
const adapter = new PrismaPg(pool);
export const prisma = globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
//# sourceMappingURL=prisma.js.map