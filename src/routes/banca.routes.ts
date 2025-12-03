import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { calcularResultadoAposta, isApostaConcluida } from '../utils/betCalculations.js';
import { handleRouteError } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();

const saldoInicialSchema = z
  .preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/\./g, '').replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }, z.number().nonnegative('Valor inicial deve ser positivo'))
  .optional();

export const createBancaSchema = z
  .object({
    nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
    descricao: z.string().max(500, 'Descrição muito longa').optional(),
    status: z.enum(['Ativa', 'Inativa']).optional(),
    ePadrao: z.boolean().optional(),
    saldoInicial: saldoInicialSchema,
  })
  .transform((data) => ({
    ...data,
    descricao: data.descricao && data.descricao.trim() !== '' ? data.descricao : undefined,
  }));

export const updateBancaSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo').optional(),
  descricao: z.string().max(500, 'Descrição muito longa').optional(),
  status: z.enum(['Ativa', 'Inativa']).optional(),
  ePadrao: z.boolean().optional()
});

export const sanitizeBankroll = <T extends Record<string, unknown>>(
  banca: T
): Omit<T, 'cor'> => {
  const { cor, ...rest } = banca as T & { cor?: unknown };
  return rest as Omit<T, 'cor'>;
};

// POST /api/bancas - Criar nova banca
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const data = createBancaSchema.parse(req.body);
    const userId = req.userId!;

    // Se for padrão, desmarcar outras bancas padrão
    if (data.ePadrao) {
      await prisma.bankroll.updateMany({
        where: { usuarioId: userId, ePadrao: true },
        data: { ePadrao: false }
      });
    }

    const createData: any = {
      nome: data.nome,
      descricao: data.descricao || null,
      usuarioId: userId,
      status: data.status || 'Ativa',
      ePadrao: data.ePadrao || false
    };

    const banca = await prisma.bankroll.create({
      data: createData
    });

    if (typeof data.saldoInicial === 'number' && data.saldoInicial > 0) {
      await prisma.financialTransaction.create({
        data: {
          bancaId: banca.id,
          tipo: 'Depósito',
          casaDeAposta: 'Saldo inicial',
          valor: data.saldoInicial,
          observacao: 'Saldo inicial configurado na criação da banca',
        }
      });
    }

    res.json(sanitizeBankroll(banca));
  } catch (error) {
    log.error(error, 'Erro ao criar banca');
    handleRouteError(error, res);
  }
});

// GET /api/bancas - Listar bancas
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    
    const bancas = await prisma.bankroll.findMany({
      where: { usuarioId: userId },
      include: {
        _count: {
          select: {
            apostas: true,
            transacoes: true
          }
        }
      },
      orderBy: { criadoEm: 'desc' }
    });

    // Buscar todas as apostas e transações de uma vez (otimização N+1)
    const bancaIds = bancas.map(b => b.id);
    const [allApostas, allTransacoes] = await Promise.all([
      prisma.bet.findMany({
        where: { bancaId: { in: bancaIds } }
      }),
      prisma.financialTransaction.findMany({
        where: { bancaId: { in: bancaIds } }
      })
    ]);

    // Agrupar por bancaId
    const apostasPorBanca = new Map<string, typeof allApostas>();
    const transacoesPorBanca = new Map<string, typeof allTransacoes>();

    allApostas.forEach(aposta => {
      const existing = apostasPorBanca.get(aposta.bancaId) || [];
      existing.push(aposta);
      apostasPorBanca.set(aposta.bancaId, existing);
    });

    allTransacoes.forEach(transacao => {
      const existing = transacoesPorBanca.get(transacao.bancaId) || [];
      existing.push(transacao);
      transacoesPorBanca.set(transacao.bancaId, existing);
    });

    // Calcular métricas básicas
    const bancasComMetricas = bancas.map((banca) => {
      const apostas = apostasPorBanca.get(banca.id) || [];
      const transacoes = transacoesPorBanca.get(banca.id) || [];

      // I. MÉTRICAS FINANCEIRAS
      const totalDepositado = transacoes
        .filter(t => t.tipo === 'Depósito')
        .reduce((sum, t) => sum + t.valor, 0);
      
      const totalSacado = transacoes
        .filter(t => t.tipo === 'Saque')
        .reduce((sum, t) => sum + t.valor, 0);

      const totalApostado = apostas.reduce((sum, a) => sum + a.valorApostado, 0);
      
      // Resultado de Apostas (apenas concluídas)
      const apostasConcluidas = apostas.filter(a => isApostaConcluida(a.status));
      const resultadoApostas = apostasConcluidas.reduce((sum, a) => {
        return sum + calcularResultadoAposta(a.status, a.valorApostado, a.retornoObtido);
      }, 0);

      // Saldo da Banca: (Total Depositado) - (Total Sacado) + (Resultado de Apostas)
      const saldoAtual = totalDepositado - totalSacado + resultadoApostas;

      return {
        ...banca,
        metricas: {
          totalApostas: apostas.length,
          totalTransacoes: transacoes.length,
          totalDepositado,
          totalSacado,
          saldoAtual,
          totalApostado,
          resultadoApostas,
          lucro: resultadoApostas
        }
      };
    });

    res.json(bancasComMetricas.map((banca) => sanitizeBankroll(banca)));
  } catch (error) {
    handleRouteError(error, res);
  }
});

// PUT /api/bancas/:id - Atualizar banca
router.put('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const data = updateBancaSchema.parse(req.body);
    const userId = req.userId!;

    const banca = await prisma.bankroll.findFirst({
      where: { id, usuarioId: userId }
    });

    if (!banca) {
      return res.status(404).json({ error: 'Banca não encontrada' });
    }

    if (data.ePadrao) {
      await prisma.bankroll.updateMany({
        where: { usuarioId: userId, NOT: { id } },
        data: { ePadrao: false }
      });
    }

    const updateData: {
      nome?: string;
      descricao?: string | null;
      status?: string;
      ePadrao?: boolean;
    } = {};
    
    if (data.nome) {
      updateData.nome = data.nome;
    }
    if (data.descricao !== undefined) {
      updateData.descricao = data.descricao;
    }
    if (data.status) {
      updateData.status = data.status;
    }
    if (typeof data.ePadrao === 'boolean') {
      updateData.ePadrao = data.ePadrao;
    }

    const updated = await prisma.bankroll.update({
      where: { id },
      data: updateData
    });

    res.json(sanitizeBankroll(updated));
  } catch (error) {
    handleRouteError(error, res);
  }
});

// DELETE /api/bancas/:id - Deletar banca
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const banca = await prisma.bankroll.findFirst({
      where: { id, usuarioId: userId }
    });

    if (!banca) {
      return res.status(404).json({ error: 'Banca não encontrada' });
    }

    await prisma.bankroll.delete({
      where: { id }
    });

    res.json({ message: 'Banca deletada com sucesso' });
  } catch (error) {
    handleRouteError(error, res);
  }
});

// GET /api/bancas/:id/compartilhar - Gerar link de compartilhamento
router.get('/:id/compartilhar', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const banca = await prisma.bankroll.findFirst({
      where: { id, usuarioId: userId }
    });

    if (!banca) {
      return res.status(404).json({ error: 'Banca não encontrada' });
    }

    // Gerar código único para compartilhamento
    const codigoCompartilhamento = Buffer.from(`${id}-${Date.now()}`).toString('base64');
    
    res.json({
      codigo: codigoCompartilhamento,
      link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/banca/${codigoCompartilhamento}`
    });
  } catch (error) {
    handleRouteError(error, res);
  }
});

export default router;
