import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { calcularResultadoAposta, isApostaConcluida, isApostaGanha } from '../utils/betCalculations.js';
import { betEventBus, emitBetEvent, BetEvent } from '../utils/betEvents.js';
import { handleRouteError } from '../utils/errorHandler.js';
import { buildBetWhere } from '../utils/buildBetWhere.js';
import { log } from '../utils/logger.js';
import { betUpdateRateLimiter } from '../middleware/rateLimiter.js';
import { normalizarEsporteParaOpcao } from '../utils/esportes.js';

const router = express.Router();

const createApostaSchema = z.object({
  bancaId: z.string().uuid('ID de banca inválido'),
  esporte: z.string().min(1).max(100, 'Nome do esporte muito longo'),
  evento: z.string().min(1).max(200, 'Nome do evento muito longo'),
  torneio: z.string().max(200, 'Nome do torneio muito longo').optional(),
  pais: z.string().max(100, 'Nome do país muito longo').optional(),
  mercado: z.string().min(1),
  tipoAposta: z.string().min(1).max(100, 'Tipo de aposta muito longo'),
  valorApostado: z.number().positive('Valor deve ser positivo').max(1000000, 'Valor muito alto'),
  odd: z.number().positive('Odd deve ser positiva').max(1000, 'Odd muito alta'),
  bonus: z.number().min(0, 'Bônus não pode ser negativo').max(1000000, 'Bônus muito alto').default(0),
  dataEvento: z.string().datetime('Data inválida').optional(),
  dataJogo: z.string().datetime('Data inválida').optional(),
  tipster: z.string().max(100, 'Nome do tipster muito longo').optional(),
  status: z.string().max(50, 'Status muito longo').default('Pendente'),
  casaDeAposta: z.string().min(1).max(100, 'Nome da casa de aposta muito longo'),
  retornoObtido: z.number().min(0, 'Retorno não pode ser negativo').max(10000000, 'Retorno muito alto').optional(),
  aposta: z.string().max(1000, 'Descrição da aposta muito longa').optional()
}).superRefine((value, ctx) => {
  if (!value.dataEvento && !value.dataJogo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dataEvento'],
      message: 'Data do evento é obrigatória',
    });
  }
});

const updateApostaSchema = z.object({
  bancaId: z.string().uuid('ID de banca inválido').optional(),
  esporte: z.string().min(1).max(100, 'Nome do esporte muito longo').optional(),
  evento: z.string().min(1).max(200, 'Nome do evento muito longo').optional(),
  torneio: z.string().max(200, 'Nome do torneio muito longo').optional(),
  pais: z.string().max(100, 'Nome do país muito longo').optional(),
  mercado: z.string().min(1).optional(),
  tipoAposta: z.string().min(1).max(100, 'Tipo de aposta muito longo').optional(),
  valorApostado: z.number().positive('Valor deve ser positivo').max(1000000, 'Valor muito alto').optional(),
  odd: z.number().positive('Odd deve ser positiva').max(1000, 'Odd muito alta').optional(),
  bonus: z.number().min(0, 'Bônus não pode ser negativo').max(1000000, 'Bônus muito alto').optional(),
  dataEvento: z.string().datetime('Data inválida').optional(),
  dataJogo: z.string().datetime('Data inválida').optional(),
  tipster: z.string().max(100, 'Nome do tipster muito longo').optional(),
  status: z.string().max(50, 'Status muito longo').optional(),
  casaDeAposta: z.string().min(1).max(100, 'Nome da casa de aposta muito longo').optional(),
  retornoObtido: z.union([z.number().min(0).max(10000000), z.null()]).optional(),
  aposta: z.string().max(1000, 'Descrição da aposta muito longa').optional()
});

const resolveEventoDate = (input: { dataEvento?: string; dataJogo?: string }): Date | null => {
  const isoString = input.dataEvento ?? input.dataJogo;
  if (!isoString) {
    return null;
  }

  const parsed = new Date(isoString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const serializeBet = <T extends {
  jogo?: string | null;
  evento?: string | null;
  dataJogo?: Date | string | null;
  dataEvento?: Date | string | null;
}>(bet: T) => ({
  ...bet,
  evento: bet.evento ?? bet.jogo ?? null,
  dataEvento: bet.dataEvento ?? bet.dataJogo ?? null,
});

// POST /api/apostas - Registrar nova aposta
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const data = createApostaSchema.parse(req.body);
    const userId = req.userId!;

    // Verificar se a banca pertence ao usuário
    const banca = await prisma.bankroll.findFirst({
      where: { id: data.bancaId, usuarioId: userId },
      include: {
        usuario: {
          select: {
            membroDesde: true,
            plano: true
          }
        }
      }
    });

    if (!banca) {
      return res.status(404).json({ error: 'Banca não encontrada' });
    }

    // Verificar limite diário de apostas do plano (reset todo dia às 00:00)
    const plano = banca.usuario.plano;

    if (plano.limiteApostasDiarias > 0) {
      const agora = new Date();

      // Calcular o início do dia atual (00:00:00)
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      // Calcular o próximo reset (amanhã às 00:00:00)
      const proximoReset = new Date(inicioDia);
      proximoReset.setDate(proximoReset.getDate() + 1);

      // Contar apostas criadas desde o início do dia atual
      const apostasHoje = await prisma.bet.count({
        where: {
          banca: { usuarioId: userId },
          createdAt: {
            gte: inicioDia
          }
        }
      });

      if (apostasHoje >= plano.limiteApostasDiarias) {
        return res.status(403).json({
          error: `Limite diário de apostas do plano ${plano.nome} atingido (${apostasHoje}/${plano.limiteApostasDiarias}). O limite será resetado em ${proximoReset.toLocaleString('pt-BR')}.`
        });
      }
    }

    const esporteNormalizado = normalizarEsporteParaOpcao(data.esporte) || data.esporte;
    const dataEventoDate = resolveEventoDate(data);

    if (!dataEventoDate) {
      return res.status(400).json({ error: 'Data do evento inválida' });
    }

    const aposta = await prisma.bet.create({
      data: {
        bancaId: data.bancaId,
        esporte: esporteNormalizado,
        jogo: data.evento,
        torneio: data.torneio,
        pais: data.pais,
        mercado: data.mercado,
        tipoAposta: data.tipoAposta,
        valorApostado: data.valorApostado,
        odd: data.odd,
        bonus: data.bonus || 0,
        dataJogo: dataEventoDate,
        tipster: data.tipster,
        status: data.status || 'Pendente',
        casaDeAposta: data.casaDeAposta,
        retornoObtido: data.retornoObtido,
        aposta: data.aposta // valor detalhado do parser
      }
    });

    const serializedAposta = serializeBet(aposta);

    emitBetEvent({
      userId,
      type: 'created',
      payload: { betId: aposta.id }
    });

    res.json(serializedAposta);
  } catch (error) {
    handleRouteError(error, res);
  }
});

// POST /api/apostas/bulk - Importação em lote
router.post('/bulk', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const betsArray = req.body;

    if (!Array.isArray(betsArray)) {
      return res.status(400).json({ error: 'Body deve ser um array de apostas' });
    }

    if (betsArray.length === 0) {
      return res.status(400).json({ error: 'Array de apostas está vazio' });
    }

    if (betsArray.length > 500) {
      return res.status(400).json({ error: 'Limite de 500 apostas por importação' });
    }

    // Validar todas as apostas primeiro
    const validatedBets = [];
    const errors = [];

    for (let i = 0; i < betsArray.length; i++) {
      try {
        const data = createApostaSchema.parse(betsArray[i]);
        validatedBets.push({ index: i, data });
      } catch (error) {
        if (error instanceof z.ZodError) {
          errors.push({
            index: i,
            errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          });
        } else {
          errors.push({ index: i, errors: ['Erro desconhecido na validação'] });
        }
      }
    }

    if (validatedBets.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma aposta válida encontrada',
        validationErrors: errors
      });
    }

    // Verificar se todas as bancas pertencem ao usuário
    const bancaIds = [...new Set(validatedBets.map(b => b.data.bancaId))];
    const bancas = await prisma.bankroll.findMany({
      where: {
        id: { in: bancaIds },
        usuarioId: userId
      },
      include: {
        usuario: {
          select: {
            membroDesde: true,
            plano: true
          }
        }
      }
    });

    if (bancas.length !== bancaIds.length) {
      return res.status(404).json({ error: 'Uma ou mais bancas não encontradas' });
    }

    // Verificar limite diário (apenas para a primeira banca)
    const plano = bancas[0].usuario.plano;

    if (plano.limiteApostasDiarias > 0) {
      const agora = new Date();
      const inicioDia = new Date(agora);
      inicioDia.setHours(0, 0, 0, 0);

      const apostasHoje = await prisma.bet.count({
        where: {
          banca: { usuarioId: userId },
          createdAt: { gte: inicioDia }
        }
      });

      const totalAposta = apostasHoje + validatedBets.length;

      if (totalAposta > plano.limiteApostasDiarias) {
        const restante = plano.limiteApostasDiarias - apostasHoje;
        return res.status(403).json({
          error: `Limite diário de apostas atingido. Restam ${restante} apostas disponíveis hoje.`,
          available: restante,
          limit: plano.limiteApostasDiarias
        });
      }
    }

    // Criar apostas em lote
    const createdBets = [];
    const creationErrors = [];

    for (const { index, data } of validatedBets) {
      try {
        const dataEventoDate = resolveEventoDate(data);

        if (!dataEventoDate) {
          throw new Error('Data do evento inválida');
        }

        const aposta = await prisma.bet.create({
          data: {
            bancaId: data.bancaId,
            esporte: data.esporte,
            jogo: data.evento,
            torneio: data.torneio,
            pais: data.pais,
            mercado: data.mercado,
            tipoAposta: data.tipoAposta,
            valorApostado: data.valorApostado,
            odd: data.odd,
            bonus: data.bonus || 0,
            dataJogo: dataEventoDate,
            tipster: data.tipster,
            status: data.status || 'Pendente',
            casaDeAposta: data.casaDeAposta,
            retornoObtido: data.retornoObtido,
            aposta: data.aposta // valor detalhado do parser
          }
        });
        createdBets.push(aposta);
      } catch (error) {
        creationErrors.push({
          index,
          error: error instanceof Error ? error.message : 'Erro ao criar aposta'
        });
      }
    }

    // Emitir evento de atualização
    if (createdBets.length > 0) {
      emitBetEvent({
        userId,
        type: 'created',
        payload: { count: createdBets.length }
      });
    }

    res.json({
      success: createdBets.length,
      errors: creationErrors.length,
      validationErrors: errors.length,
      total: betsArray.length,
      details: {
        created: createdBets.length,
        failed: creationErrors.length,
        validationFailed: errors.length
      }
    });
  } catch (error) {
    handleRouteError(error, res);
  }
});

// GET /api/apostas - Listar apostas com filtros
router.get('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const {
      esporte,
      status,
      tipster,
      dataInicio,
      dataFim,
      casa,
      bancaId,
      oddMin,
      oddMax
    } = req.query;

    const bancas = await prisma.bankroll.findMany({
      where: { usuarioId: userId },
      select: { id: true }
    });

    const bancaIds = bancas.map((b: { id: string }) => b.id);

    if (bancaIds.length === 0) {
      return res.json([]);
    }

    // Se bancaId específico foi fornecido, filtrar apenas essa banca
    const filteredBancaIds = bancaId && typeof bancaId === 'string'
      ? bancaIds.filter((id: string) => id === bancaId)
      : bancaIds;

    if (filteredBancaIds.length === 0) {
      return res.json([]);
    }

    const where = buildBetWhere({
      bancaIds: filteredBancaIds,
      esporte: typeof esporte === 'string' ? esporte : undefined,
      status: typeof status === 'string' ? status : undefined,
      tipster: typeof tipster === 'string' ? tipster : undefined,
      casa: typeof casa === 'string' ? casa : undefined,
      oddMin: typeof oddMin === 'string' ? oddMin : undefined,
      oddMax: typeof oddMax === 'string' ? oddMax : undefined,
      dataInicio: typeof dataInicio === 'string' ? dataInicio : undefined,
      dataFim: typeof dataFim === 'string' ? dataFim : undefined
    });

    const apostas = await prisma.bet.findMany({
      where,
      include: {
        banca: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { dataJogo: 'desc' }
    });

    res.json(apostas.map(serializeBet));
  } catch (error) {
    handleRouteError(error, res);
  }
});

// PUT /api/apostas/:id - Atualizar resultado da aposta
router.put('/:id', authenticateToken, betUpdateRateLimiter, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const data = updateApostaSchema.parse(req.body);
    const userId = req.userId!;

    // Verificar se a aposta pertence a uma banca do usuário
    const aposta = await prisma.bet.findFirst({
      where: { id },
      include: {
        banca: {
          select: { usuarioId: true }
        }
      }
    });

    if (!aposta || aposta.banca.usuarioId !== userId) {
      return res.status(404).json({ error: 'Aposta não encontrada' });
    }

    const updateData: {
      bancaId?: string;
      esporte?: string;
      jogo?: string;
      torneio?: string | null;
      pais?: string | null;
      mercado?: string;
      tipoAposta?: string;
      valorApostado?: number;
      odd?: number;
      bonus?: number;
      dataJogo?: Date;
      tipster?: string | null;
      status?: string;
      casaDeAposta?: string;
      retornoObtido?: number | null;
    } = {};

    if (data.bancaId) updateData.bancaId = data.bancaId;
    if (data.esporte) {
      updateData.esporte = normalizarEsporteParaOpcao(data.esporte) || data.esporte;
    }
    if (data.evento) updateData.jogo = data.evento;
    if (data.torneio !== undefined) updateData.torneio = data.torneio;
    if (data.pais !== undefined) updateData.pais = data.pais;
    if (data.mercado) updateData.mercado = data.mercado;
    if (data.tipoAposta) updateData.tipoAposta = data.tipoAposta;
    if (data.valorApostado) updateData.valorApostado = data.valorApostado;
    if (data.odd) updateData.odd = data.odd;
    if (data.bonus !== undefined) updateData.bonus = data.bonus;
    const updatedDate = resolveEventoDate(data);
    if (updatedDate) updateData.dataJogo = updatedDate;
    if (data.tipster !== undefined) updateData.tipster = data.tipster;
    if (data.status) updateData.status = data.status;
    if (data.casaDeAposta) updateData.casaDeAposta = data.casaDeAposta;
    // Sempre atualizar retornoObtido se fornecido (pode ser null para limpar)
    if (data.retornoObtido !== undefined) {
      updateData.retornoObtido = data.retornoObtido;
    }

    const updated = await prisma.bet.update({
      where: { id },
      data: updateData
    });

    const serializedUpdated = serializeBet(updated);

    emitBetEvent({
      userId,
      type: 'updated',
      payload: { betId: updated.id }
    });

    res.json(serializedUpdated);
  } catch (error) {
    handleRouteError(error, res);
  }
});

// GET /api/apostas/resumo - Retornar métricas de resumo
router.get('/resumo', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bancaId } = req.query;

    const bancas = await prisma.bankroll.findMany({
      where: {
        usuarioId: userId,
        ...(bancaId ? { id: bancaId as string } : {})
      }
    });

    const bancaIds = bancas.map((b: { id: string }) => b.id);

    const apostas = await prisma.bet.findMany({
      where: { bancaId: { in: bancaIds } }
    });

    const totalApostas = apostas.length;
    // Total Investido: todas as apostas (concluídas ou pendentes)
    const totalInvestido = apostas.reduce((sum: number, a: any) => sum + a.valorApostado, 0);

    // Resultado de Apostas: apenas concluídas
    const apostasConcluidas = apostas.filter((a: any) => isApostaConcluida(a.status));
    const resultadoApostas = apostasConcluidas.reduce((sum: number, a: any) => {
      return sum + calcularResultadoAposta(a.status, a.valorApostado, a.retornoObtido);
    }, 0);

    const apostasGanhas = apostasConcluidas.filter((a: any) => isApostaGanha(a.status));
    const apostasPendentes = apostas.filter((a: any) => a.status === 'Pendente').length;
    const apostasPerdidas = apostas.filter((a: any) => a.status === 'Perdida').length;
    const apostasVoid = apostas.filter((a: any) => a.status === 'Void').length;

    // Taxa de Acerto: apenas apostas concluídas
    const taxaAcerto = apostasConcluidas.length > 0
      ? (apostasGanhas.length / apostasConcluidas.length) * 100
      : 0;

    res.json({
      totalApostas,
      totalInvestido,
      resultadoApostas: Number(resultadoApostas.toFixed(2)),
      taxaAcerto: Number(taxaAcerto.toFixed(2)),
      apostasGanhas: apostasGanhas.length,
      apostasPerdidas,
      apostasPendentes,
      apostasVoid,
      apostasConcluidas: apostasConcluidas.length
    });
  } catch (error) {
    handleRouteError(error, res);
  }
});

// DELETE /api/apostas/:id - Deletar uma aposta
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Verificar se a aposta pertence a uma banca do usuário
    const aposta = await prisma.bet.findFirst({
      where: { id },
      include: {
        banca: {
          select: { usuarioId: true }
        }
      }
    });

    if (!aposta || aposta.banca.usuarioId !== userId) {
      return res.status(404).json({ error: 'Aposta não encontrada' });
    }

    await prisma.bet.delete({
      where: { id }
    });

    emitBetEvent({
      userId,
      type: 'deleted',
      payload: { betId: id }
    });

    res.json({ message: 'Aposta deletada com sucesso' });
  } catch (error) {
    handleRouteError(error, res);
  }
});

// DELETE /api/apostas/all - Resetar todas as apostas (Zona de Perigo)
router.delete('/all', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { confirmacao } = req.body;

    if (confirmacao !== 'CONFIRMAR_DELETE_TODAS_APOSTAS') {
      return res.status(400).json({
        error: 'Confirmação inválida. Esta ação é irreversível.'
      });
    }

    const bancas = await prisma.bankroll.findMany({
      where: { usuarioId: userId },
      select: { id: true }
    });

    const bancaIds = bancas.map((b: { id: string }) => b.id);

    const result = await prisma.bet.deleteMany({
      where: { bancaId: { in: bancaIds } }
    });

    emitBetEvent({
      userId,
      type: 'deleted',
      payload: { scope: 'all' }
    });

    res.json({
      message: `${result.count} apostas deletadas com sucesso`,
      count: result.count
    });
  } catch (error) {
    handleRouteError(error, res);
  }
});

// GET /api/apostas/recentes - Buscar últimas 5 apostas
router.get('/recentes', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bancaId } = req.query;

    const bancas = await prisma.bankroll.findMany({
      where: { usuarioId: userId },
      select: { id: true }
    });

    const bancaIds = bancas.map((b: { id: string }) => b.id);
    const filteredBancaIds = typeof bancaId === 'string' && bancaId
      ? bancaIds.filter((id: string) => id === bancaId)
      : bancaIds;

    if (filteredBancaIds.length === 0) {
      return res.json([]);
    }

    const apostasRecentes = await prisma.bet.findMany({
      where: { bancaId: { in: filteredBancaIds } },
      include: {
        banca: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Calcular lucro/prejuízo para cada aposta
    const apostasComLucro = apostasRecentes.map((aposta: any) => {
      const resultado = calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
      return {
        id: aposta.id,
        evento: `${aposta.jogo}${aposta.torneio ? ` - ${aposta.torneio}` : ''}`,
        odd: aposta.odds?.toString() || aposta.odd?.toString() || '-',
        status: aposta.status === 'Ganha' || aposta.status === 'Meio Ganha' ? 'GANHOU' :
          aposta.status === 'Perdida' || aposta.status === 'Meio Perdida' ? 'PERDEU' :
            aposta.status,
        lucro: resultado,
        dataJogo: aposta.dataJogo,
        esporte: aposta.esporte,
        casaDeAposta: aposta.casaDeAposta
      };
    });

    res.json(apostasComLucro);
  } catch (error) {
    handleRouteError(error, res);
  }
});

// GET /api/apostas/stream - Stream de atualizações de apostas
router.get('/stream', authenticateToken, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const nodeRes = res as any;
  if (typeof nodeRes.flushHeaders === 'function') {
    nodeRes.flushHeaders();
  }

  const sendEvent = (event: BetEvent) => {
    if (event.userId !== userId) {
      return;
    }
    res.write('event: bet-update\n');
    res.write(`data: ${JSON.stringify({ type: event.type, payload: event.payload || null })}\n\n`);
  };

  betEventBus.on('bet-event', sendEvent);

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    betEventBus.off('bet-event', sendEvent);
  });
});

export default router;
