import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig } from '@prisma/config';

// Carregar env
config({ path: resolve(process.cwd(), '.env') });
config(); // fallback

// Validar DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL não encontrada no .env");
}

export default defineConfig({
  // A nova sintaxe do Prisma 7 é exatamente assim ↓↓↓
  datasource: {
    url: databaseUrl,
    provider: "postgresql", // coloque seu provider: mysql, postgresql, sqlite...
  },
});
