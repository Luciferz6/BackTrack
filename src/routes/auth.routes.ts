import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { sensitiveRateLimiter } from '../middleware/rateLimiter.js';
import { log } from '../utils/logger.js';
import { handleRouteError } from '../utils/errorHandler.js';

const router = express.Router();

const registerSchema = z.object({
  nomeCompleto: z.string().min(3).max(100, 'Nome muito longo'),
  email: z.string().email().max(255, 'Email muito longo'),
  senha: z.string().min(6).max(100, 'Senha muito longa')
});

const loginSchema = z.object({
  email: z.string().email().max(255, 'Email muito longo'),
  senha: z.string().max(100, 'Senha muito longa')
});

// Register
router.post('/register', sensitiveRateLimiter, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(data.senha, 10);
    
    const freePlan = await prisma.plan.findUnique({
      where: { nome: 'Gratuito' }
    });

    if (!freePlan) {
      return res.status(500).json({ error: 'Plano padrão não encontrado. Execute o script de inicialização.' });
    }

    // Criar usuário e banca padrão em uma transação
    const result = await prisma.$transaction(async (tx) => {
      // Criar usuário
      const user = await tx.user.create({
        data: {
          nomeCompleto: data.nomeCompleto,
          email: data.email,
          senha: hashedPassword,
          planoId: freePlan.id
        }
      });

      // Criar banca padrão para o usuário
      const bancaPadrao = await tx.bankroll.create({
        data: {
          nome: 'Banca Principal',
          descricao: 'Banca padrão criada automaticamente',
          usuarioId: user.id,
          status: 'Ativa',
          ePadrao: true,
          cor: '#2563eb' // Cor padrão do sistema
        }
      });

      log.info({ userId: user.id, bancaId: bancaPadrao.id }, 'Usuário e banca padrão criados');

      return { user, bancaPadrao };
    });

    const token = jwt.sign(
      { userId: result.user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: result.user.id,
        nomeCompleto: result.user.nomeCompleto,
        email: result.user.email
      }
    });
  } catch (error) {
    log.error(error, 'Erro ao registrar usuário');
    handleRouteError(error, res);
  }
});

// Login
router.post('/login', sensitiveRateLimiter, async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { plano: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(data.senha, user.senha);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nomeCompleto: user.nomeCompleto,
        email: user.email,
        plano: user.plano
      }
    });
  } catch (error) {
    log.error(error, 'Erro ao fazer login');
    handleRouteError(error, res);
  }
});

// Login via Telegram Web App
router.post('/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    if (!initData || typeof initData !== 'string') {
      return res.status(400).json({ error: 'initData do Telegram não fornecido' });
    }

    // Parse do initData do Telegram (formato: key=value&key2=value2)
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    
    if (!userStr) {
      return res.status(400).json({ error: 'Dados do usuário não encontrados no initData' });
    }

    const telegramUser = JSON.parse(userStr) as { id: number; first_name?: string; last_name?: string; username?: string };
    const telegramId = String(telegramUser.id);

    // Buscar usuário pelo telegramId
    const user = await prisma.user.findFirst({
      where: { telegramId },
      include: { plano: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado. Vincule sua conta do Telegram primeiro.' });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nomeCompleto: user.nomeCompleto,
        email: user.email,
        plano: user.plano
      }
    });
  } catch (error) {
    log.error(error, 'Erro ao fazer login via Telegram');
    handleRouteError(error, res);
  }
});

export default router;
