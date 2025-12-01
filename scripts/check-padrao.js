import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const bancas = await prisma.bankroll.findMany({
    where: {
      usuario: {
        email: 'leonardo06y@hotmail.com'
      }
    },
    select: {
      id: true,
      nome: true,
      ePadrao: true
    }
  });
  
  console.log('Bancas do usuário leonardo:');
  console.log(JSON.stringify(bancas, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
