import { Client } from 'pg';

const PROMO_CODE = process.env.PROMO_CODE?.trim() || 'realteste';
const PROMO_USAGE_LIMIT = Number(process.env.PROMO_USAGE_LIMIT ?? '17');

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL não definida.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS total FROM promo_code_redemptions WHERE code = $1',
    [PROMO_CODE]
  );

  const totalUses = rows[0]?.total ?? 0;
  const remaining = Math.max(0, PROMO_USAGE_LIMIT - totalUses);

  console.log('Código promocional:', PROMO_CODE);
  console.log('Limite configurado:', PROMO_USAGE_LIMIT);
  console.log('Total de usos:', totalUses);
  console.log('Usos restantes:', remaining);

  await client.end();
}

main().catch((error) => {
  console.error('Erro ao verificar promoções:', error);
  process.exit(1);
});
