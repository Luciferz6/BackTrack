import express from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import { sensitiveRateLimiter } from '../middleware/rateLimiter.js';
import { log } from '../utils/logger.js';
// Removido uso de cache Redis
const router = express.Router();
// Schemas necessários
const updateProfileSchema = z.object({
    nomeCompleto: z.string().min(3).max(100).optional(),
    email: z.string().email().max(255).optional(),
    planoId: z.string().uuid().optional()
});
const changePasswordSchema = z.object({
    senhaAtual: z.string().min(6).max(100),
    novaSenha: z.string().min(6).max(100)
});
const updatePlanSchema = z.object({
    planoId: z.string().uuid()
});
const updateTelegramSchema = z.object({
    telegramId: z.union([
        z.string().regex(/^\d+$/, 'O ID do Telegram deve conter apenas números').min(5).max(20),
        z.null()
    ])
});
// PUT /api/perfil - Atualizar perfil do usuário
router.put('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = updateProfileSchema.parse(req.body);
        // Verificar se o plano existe
        const plan = await prisma.plan.findUnique({
            where: { id: data.planoId }
        });
        if (!plan) {
            return res.status(404).json({ error: 'Plano não encontrado' });
        }
        // Atualizar plano do usuário
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { planoId: data.planoId },
            select: {
                id: true,
                nomeCompleto: true,
                email: true,
                plano: {
                    select: {
                        id: true,
                        nome: true,
                        preco: true,
                        limiteApostasDiarias: true
                    }
                }
            }
        });
        res.json({
            message: `Plano atualizado para ${updated.plano.nome}`,
            user: updated
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/perfil/senha - Alterar senha
router.put('/senha', authenticate, sensitiveRateLimiter, async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = changePasswordSchema.parse(req.body);
        log.info({ userId }, 'Iniciando alteração de senha');
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                plano: true,
                bancas: true
            }
        });
        if (!user) {
            log.warn({ userId }, 'Usuário não encontrado ao tentar alterar senha');
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        log.debug('Verificando senha atual');
        const validPassword = await bcrypt.compare(data.senhaAtual, user.senha);
        if (!validPassword) {
            log.warn({ userId, email: user.email }, 'Senha atual incorreta ao tentar alterar senha');
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }
        log.debug('Gerando hash da nova senha');
        const hashedPassword = await bcrypt.hash(data.novaSenha, 10);
        log.debug('Atualizando senha no banco de dados');
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { senha: hashedPassword },
            select: {
                id: true,
                email: true,
                updatedAt: true,
                senha: true
            }
        });
        // Verificar se a senha foi realmente atualizada
        const passwordMatches = await bcrypt.compare(data.novaSenha, updatedUser.senha);
        if (!passwordMatches) {
            log.error({ userId, email: updatedUser.email }, 'ERRO: A senha não foi atualizada corretamente');
            return res.status(500).json({ error: 'Erro ao atualizar senha. Tente novamente.' });
        }
        log.info({ userId, email: updatedUser.email }, 'Senha alterada com sucesso');
        res.json({ message: 'Senha alterada com sucesso' });
    }
    catch (error) {
        log.error(error, 'Erro ao alterar senha');
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});
// GET /api/perfil/consumo - Obter consumo diário do plano
router.get('/consumo', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                plano: true,
                bancas: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const agora = new Date();
        // Calcular o início do dia atual (00:00:00) no timezone local
        const inicioDia = new Date(agora);
        inicioDia.setHours(0, 0, 0, 0);
        // Calcular o próximo reset (amanhã às 00:00:00) no timezone local
        const proximoReset = new Date(inicioDia);
        proximoReset.setDate(proximoReset.getDate() + 1);
        // Contar apostas criadas desde o início do dia atual
        const bancaIds = user.bancas.map(b => b.id);
        const apostasHoje = await prisma.bet.count({
            where: {
                bancaId: { in: bancaIds },
                createdAt: {
                    gte: inicioDia
                }
            }
        });
        const limite = user.plano.limiteApostasDiarias;
        const porcentagem = limite > 0 ? Math.round((apostasHoje / limite) * 100) : 0;
        res.json({
            plano: {
                nome: user.plano.nome,
                limiteDiario: limite
            },
            consumo: {
                apostasHoje,
                limite,
                porcentagem,
                proximoReset: proximoReset.toISOString()
            }
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/perfil/plano - Atualizar plano do usuário
router.put('/plano', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = updatePlanSchema.parse(req.body);
        // Verificar se o plano existe
        const plan = await prisma.plan.findUnique({
            where: { id: data.planoId }
        });
        if (!plan) {
            return res.status(404).json({ error: 'Plano não encontrado' });
        }
        // Atualizar plano do usuário
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { planoId: data.planoId },
            select: {
                id: true,
                nomeCompleto: true,
                email: true,
                plano: {
                    select: {
                        id: true,
                        nome: true,
                        preco: true,
                        limiteApostasDiarias: true
                    }
                }
            }
        });
        res.json({
            message: `Plano atualizado para ${updated.plano.nome}`,
            user: updated
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error.message });
    }
});
router.put('/telegram', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        const data = updateTelegramSchema.parse(req.body);
        const { telegramId } = data;
        if (telegramId) {
            const existing = await prisma.user.findFirst({
                where: {
                    telegramId,
                    NOT: { id: userId }
                }
            });
            if (existing) {
                return res.status(400).json({ error: 'Este ID do Telegram já está vinculado a outra conta.' });
            }
        }
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { telegramId },
            select: {
                id: true,
                nomeCompleto: true,
                email: true,
                membroDesde: true,
                statusConta: true,
                updatedAt: true,
                telegramId: true,
                telegramUsername: true,
                plano: {
                    select: {
                        id: true,
                        nome: true,
                        preco: true,
                        limiteApostasDiarias: true
                    }
                }
            }
        });
        res.json(updated);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        res.status(500).json({ error: error.message });
    }
});
// GET /api/perfil/planos - Listar todos os planos disponíveis
router.get('/planos', authenticate, async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({
            select: {
                id: true,
                nome: true,
                preco: true,
                limiteApostasDiarias: true
            },
            orderBy: { limiteApostasDiarias: 'asc' }
        });
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/perfil/reset - Resetar todos os dados da conta
router.delete('/reset', authenticate, sensitiveRateLimiter, async (req, res) => {
    try {
        const userId = req.user.userId;
        log.warn({ userId }, 'Iniciando reset de dados da conta');
        // Buscar todas as bancas do usuário
        const bancas = await prisma.bankroll.findMany({
            where: { usuarioId: userId },
            select: { id: true }
        });
        const bancaIds = bancas.map(b => b.id);
        log.info({ userId, bancasCount: bancaIds.length }, 'Bancas encontradas para reset');
        // Deletar todas as apostas do usuário
        const deletedBets = await prisma.bet.deleteMany({
            where: { bancaId: { in: bancaIds } }
        });
        log.info({ userId, deletedBets: deletedBets.count }, 'Apostas deletadas');
        // Deletar todas as transações financeiras do usuário
        const deletedTransactions = await prisma.financialTransaction.deleteMany({
            where: { bancaId: { in: bancaIds } }
        });
        log.info({ userId, deletedTransactions: deletedTransactions.count }, 'Transações deletadas');
        // Deletar todas as bancas do usuário
        const deletedBancas = await prisma.bankroll.deleteMany({
            where: { usuarioId: userId }
        });
        log.info({ userId, deletedBancas: deletedBancas.count }, 'Bancas deletadas');
        log.info({ userId }, 'Reset de conta concluído com sucesso');
        res.json({
            message: 'Todos os dados da conta foram resetados com sucesso',
            deleted: {
                bancas: deletedBancas.count,
                apostas: deletedBets.count,
                transacoes: deletedTransactions.count
            }
        });
    }
    catch (error) {
        log.error(error, 'Erro ao resetar conta');
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});
// GET /api/perfil - Obter dados do perfil
router.get('/', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        log.info({ userId }, 'Tentando carregar perfil do usuário');
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                nomeCompleto: true,
                email: true,
                membroDesde: true,
                statusConta: true,
                updatedAt: true,
                telegramId: true,
                telegramUsername: true,
                plano: {
                    select: {
                        id: true,
                        nome: true,
                        preco: true,
                        limiteApostasDiarias: true
                    }
                }
            }
        });
        if (!user) {
            log.warn({ userId }, 'Usuário não encontrado ao carregar perfil');
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        log.info({ userId }, 'Perfil carregado com sucesso');
        res.json(user);
    }
    catch (error) {
        log.error(error, 'Erro ao carregar perfil');
        res.status(500).json({ error: error.message });
    }
});
export default router;
//# sourceMappingURL=perfil.routes.js.map