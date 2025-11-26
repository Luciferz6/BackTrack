import express from 'express';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Schema de validação
const createTipsterSchema = z.object({
  nome: z.string().min(1, 'Nome do tipster é obrigatório').max(100, 'Nome muito longo')
});

const updateTipsterSchema = z.object({
  nome: z.string().min(1, 'Nome do tipster é obrigatório').max(100, 'Nome muito longo').optional(),
  ativo: z.boolean().optional()
});

// GET /api/tipsters - Listar todos os tipsters do usuário
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    const tipsters = await prisma.tipster.findMany({
      where: {
        usuarioId: userId
      },
      orderBy: {
        nome: 'asc'
      }
    });

    return res.json(tipsters);
  } catch (error) {
    log.error(error, 'Erro ao listar tipsters');
    return res.status(500).json({ error: 'Erro ao listar tipsters' });
  }
});

// POST /api/tipsters - Criar novo tipster
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const data = createTipsterSchema.parse(req.body);

    // Verificar se já existe um tipster com o mesmo nome para este usuário
    const existingTipster = await prisma.tipster.findFirst({
      where: {
        usuarioId: userId,
        nome: data.nome.trim()
      }
    });

    if (existingTipster) {
      return res.status(400).json({ error: 'Já existe um tipster com este nome' });
    }

    const tipster = await prisma.tipster.create({
      data: {
        nome: data.nome.trim(),
        usuarioId: userId,
        ativo: true
      }
    });

    return res.status(201).json(tipster);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    log.error(error, 'Erro ao criar tipster');
    return res.status(500).json({ error: 'Erro ao criar tipster' });
  }
});

// PUT /api/tipsters/:id - Atualizar tipster
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const data = updateTipsterSchema.parse(req.body);

    // Verificar se o tipster pertence ao usuário
    const tipster = await prisma.tipster.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!tipster) {
      return res.status(404).json({ error: 'Tipster não encontrado' });
    }

    // Se estiver atualizando o nome, verificar se já existe outro com o mesmo nome
    if (data.nome && data.nome.trim() !== tipster.nome) {
      const existingTipster = await prisma.tipster.findFirst({
        where: {
          usuarioId: userId,
          nome: data.nome.trim(),
          id: { not: id }
        }
      });

      if (existingTipster) {
        return res.status(400).json({ error: 'Já existe um tipster com este nome' });
      }
    }

    const updateData: any = {};
    if (data.nome !== undefined) updateData.nome = data.nome.trim();
    if (data.ativo !== undefined) updateData.ativo = data.ativo;

    const updatedTipster = await prisma.tipster.update({
      where: { id },
      data: updateData
    });

    return res.json(updatedTipster);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    log.error(error, 'Erro ao atualizar tipster');
    return res.status(500).json({ error: 'Erro ao atualizar tipster' });
  }
});

// DELETE /api/tipsters/:id - Deletar tipster
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Verificar se o tipster pertence ao usuário
    const tipster = await prisma.tipster.findFirst({
      where: {
        id,
        usuarioId: userId
      }
    });

    if (!tipster) {
      return res.status(404).json({ error: 'Tipster não encontrado' });
    }

    await prisma.tipster.delete({
      where: { id }
    });

    return res.status(204).send();
  } catch (error) {
    log.error(error, 'Erro ao deletar tipster');
    return res.status(500).json({ error: 'Erro ao deletar tipster' });
  }
});

export default router;

