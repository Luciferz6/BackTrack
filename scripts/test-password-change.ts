import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function testPasswordChange() {
  try {
    // Buscar um usuário de teste
    const user = await prisma.user.findFirst({
      where: {
        email: {
          contains: '@'
        }
      }
    });

    if (!user) {
      console.log('❌ Nenhum usuário encontrado para teste');
      return;
    }

    console.log('✅ Usuário encontrado:', user.email);
    console.log('📝 Senha atual (hash):', user.senha.substring(0, 20) + '...');

    // Criar uma nova senha de teste
    const novaSenha = 'teste123';
    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    console.log('\n🔄 Atualizando senha...');
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { senha: hashedPassword }
    });

    console.log('✅ Senha atualizada no banco');
    console.log('📝 Nova senha (hash):', updatedUser.senha.substring(0, 20) + '...');

    // Verificar se a senha foi realmente atualizada
    const verifyUser = await prisma.user.findUnique({
      where: { id: user.id }
    });

    if (verifyUser) {
      const passwordMatches = await bcrypt.compare(novaSenha, verifyUser.senha);
      console.log('\n🔍 Verificação:');
      console.log('  - Nova senha corresponde?', passwordMatches ? '✅ SIM' : '❌ NÃO');
      
      if (passwordMatches) {
        console.log('\n✅ TESTE PASSOU: A senha foi atualizada corretamente!');
      } else {
        console.log('\n❌ TESTE FALHOU: A senha não foi atualizada corretamente!');
      }
    }

    // Restaurar senha original (opcional)
    console.log('\n⚠️  NOTA: A senha do usuário foi alterada para "teste123"');
    console.log('   Você precisará alterá-la manualmente ou resetar o usuário.');

  } catch (error: any) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPasswordChange();

