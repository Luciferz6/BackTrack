import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function resetPassword() {
  const userEmail = 'flaviodacosta1998@gmail.com';
  const newPassword = '123456';
  
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  const user = await prisma.user.update({
    where: { email: userEmail },
    data: { senha: hashedPassword }
  });
  
  console.log('Senha resetada com sucesso para o usuario:', user.nomeCompleto);
  console.log('Email:', user.email);
  console.log('Nova senha: 123456');
  
  await prisma.$disconnect();
}

resetPassword().catch(console.error);
