import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { calcularResultadoAposta, isApostaConcluida } from '../utils/betCalculations.js';
// ...existing code...

const router = express.Router();

const dateStringSchema = z.string().refine((value) => {
  if (!value) return true;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}, { message: 'Invalid datetime' });

const createTransacaoSchema = z.object({
  bancaId: z.string().uuid('ID de banca inválido'),
  tipo: z.enum(['Depósito', 'Saque']),
  casaDeAposta: z.string().min(1).max(100, 'Nome da casa de aposta muito longo'),
  valor: z.number().positive('Valor deve ser positivo').max(10000000, 'Valor muito alto'),
  dataTransacao: dateStringSchema.optional(),
  observacao: z.string().max(500, 'Observação muito longa').optional()
});

const updateTransacaoSchema = z.object({
  id: z.string().uuid('ID inválido'),
  bancaId: z.string().uuid('ID de banca inválido').optional(),
  tipo: z.enum(['Depósito', 'Saque']).optional(),
  casaDeAposta: z.string().min(1).max(100, 'Nome da casa de aposta muito longo').optional(),
  valor: z.number().positive('Valor deve ser positivo').max(10000000, 'Valor muito alto').optional(),
  dataTransacao: dateStringSchema.optional(),
  observacao: z.string().max(500, 'Observação muito longa').optional()
});

const deleteSchema = z.object({
  id: z.string()
});

// POST /api/financeiro/transacao - Registrar nova transação
router.post('/transacao', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const data = createTransacaoSchema.parse(req.body);
    const userId = req.userId!;

    // Verificar se a banca pertence ao usuário
    const banca = await prisma.bankroll.findFirst({
      where: { id: data.bancaId, usuarioId: userId }
    });

    if (!banca) {
      return res.status(404).json({ error: 'Banca não encontrada' });
    }

    const transacao = await prisma.financialTransaction.create({
      data: {
        bancaId: data.bancaId,
        tipo: data.tipo,
        casaDeAposta: data.casaDeAposta,
        valor: data.valor,
        dataTransacao: data.dataTransacao ? new Date(data.dataTransacao) : new Date(),
        observacao: data.observacao
      }
    });
    res.json(transacao);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/financeiro/transacao/:id - Atualizar transação
router.put('/transacao/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const params = deleteSchema.parse({ id: req.params.id });
    const body = updateTransacaoSchema.parse({ ...req.body, id: params.id });
    const userId = req.userId!;

    const transacao = await prisma.financialTransaction.findUnique({
      where: { id: params.id },
      include: {
        banca: { select: { usuarioId: true } }
      }
    });

    if (!transacao || transacao.banca?.usuarioId !== userId) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    const data: any = {};
    if (body.tipo) data.tipo = body.tipo;
    if (body.casaDeAposta) data.casaDeAposta = body.casaDeAposta;
    if (typeof body.valor === 'number') data.valor = body.valor;
    if (body.dataTransacao) data.dataTransacao = new Date(body.dataTransacao);
    if (body.observacao !== undefined) data.observacao = body.observacao;

    const updated = await prisma.financialTransaction.update({
      where: { id: params.id },
      data
    });
    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/financeiro/transacao/:id - Remover transação
router.delete('/transacao/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const params = deleteSchema.parse({ id: req.params.id });
    const userId = req.userId!;

    const transacao = await prisma.financialTransaction.findUnique({
      where: { id: params.id },
      include: {
        banca: { select: { usuarioId: true } }
      }
    });

    if (!transacao || transacao.banca?.usuarioId !== userId) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    await prisma.financialTransaction.delete({
      where: { id: params.id }
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/financeiro/transacoes - Listar transações com filtros
router.get('/transacoes', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { tipo, casa, bancaId, dataInicio, dataFim } = req.query;

    const bancas = await prisma.bankroll.findMany({
      where: { usuarioId: userId },
      select: { id: true }
    });

    const bancaIds = bancas.map(b => b.id);

    const where: any = {
      bancaId: { in: bancaIds }
    };

    if (tipo) {
      where.tipo = tipo;
    }

    if (casa) {
      where.casaDeAposta = { contains: casa as string };
    }

    if (bancaId) {
      where.bancaId = bancaId;
    }

    if (dataInicio || dataFim) {
      where.dataTransacao = {};
      if (dataInicio) {
        where.dataTransacao.gte = new Date(dataInicio as string);
      }
      if (dataFim) {
        where.dataTransacao.lte = new Date(dataFim as string);
      }
    }

    const transacoes = await prisma.financialTransaction.findMany({
      where,
      include: {
        banca: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { dataTransacao: 'desc' }
    });

    res.json(transacoes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/financeiro/saldo-geral - Calcular métricas financeiras
router.get('/saldo-geral', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { bancaId } = req.query;

    const bancas = await prisma.bankroll.findMany({
      where: {
        usuarioId: userId,
        ...(bancaId ? { id: bancaId as string } : {})
      }
    });

    const bancaIds = bancas.map(b => b.id);

    const transacoes = await prisma.financialTransaction.findMany({
      where: { bancaId: { in: bancaIds } }
    });

    const apostas = await prisma.bet.findMany({
      where: { bancaId: { in: bancaIds } }
    });

    // Métricas de transações
    const totalDepositado = transacoes
      .filter(t => t.tipo === 'Depósito')
      .reduce((sum, t) => sum + t.valor, 0);

    const totalSacado = transacoes
      .filter(t => t.tipo === 'Saque')
      .reduce((sum, t) => sum + t.valor, 0);

    const totalDepositos = transacoes.filter(t => t.tipo === 'Depósito').length;
    const totalSaques = transacoes.filter(t => t.tipo === 'Saque').length;

    // Métricas de apostas
    const apostasConcluidas = apostas.filter(a => isApostaConcluida(a.status));
    const apostasPendentes = apostas.filter(a => a.status === 'Pendente');
    
    const resultadoApostas = apostasConcluidas.reduce((sum, a) => {
      return sum + calcularResultadoAposta(a.status, a.valorApostado, a.retornoObtido);
    }, 0);

    const valorApostasPendentes = apostasPendentes.reduce((sum, a) => sum + a.valorApostado, 0);

    // Saldo atual: Total Depositado - Total Sacado + Resultado de Apostas
    const saldoAtual = totalDepositado - totalSacado + resultadoApostas;

    // Agrupar por casa de aposta
    const porCasa: { [key: string]: { depositos: number; saques: number; saldo: number; apostas: number; resultado: number } } = {};
    
    // Adicionar transações
    transacoes.forEach(transacao => {
      if (!porCasa[transacao.casaDeAposta]) {
        porCasa[transacao.casaDeAposta] = { depositos: 0, saques: 0, saldo: 0, apostas: 0, resultado: 0 };
      }
      if (transacao.tipo === 'Depósito') {
        porCasa[transacao.casaDeAposta].depositos += transacao.valor;
      } else if (transacao.tipo === 'Saque') {
        porCasa[transacao.casaDeAposta].saques += transacao.valor;
      }
    });
    
    // Adicionar apostas
    apostas.forEach(aposta => {
      if (!porCasa[aposta.casaDeAposta]) {
        porCasa[aposta.casaDeAposta] = { depositos: 0, saques: 0, saldo: 0, apostas: 0, resultado: 0 };
      }
      porCasa[aposta.casaDeAposta].apostas += 1;
    });
    
    // Adicionar resultados das apostas concluídas
    apostasConcluidas.forEach(aposta => {
      const resultado = calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
      porCasa[aposta.casaDeAposta].resultado += resultado;
    });
    
    // Calcular saldo final por casa (depósitos - saques + resultado de apostas)
    Object.keys(porCasa).forEach(casa => {
      porCasa[casa].saldo = porCasa[casa].depositos - porCasa[casa].saques + porCasa[casa].resultado;
    });

    res.json({
      totalDepositado,
      totalSacado,
      saldoAtual,
      totalTransacoes: transacoes.length,
      totalDepositos,
      totalSaques,
      resultadoApostas,
      apostasPendentes: apostasPendentes.length,
      valorApostasPendentes,
      apostasConcluidas: apostasConcluidas.length,
      porCasa
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
