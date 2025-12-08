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
        // Criar usuário, banca e tipster padrão em uma transação
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
                    ePadrao: true
                }
            });
            // Criar tipster padrão utilizando o apelido informado no cadastro
            const tipsterPadrao = await tx.tipster.create({
                data: {
                    nome: data.nomeCompleto.trim() || 'Tipster Padrão',
                    usuarioId: user.id,
                    ativo: true
                }
            });
            log.info({ userId: user.id, bancaId: bancaPadrao.id, tipsterId: tipsterPadrao.id }, 'Usuário, banca e tipster padrão criados');
            return { user, bancaPadrao };
        });
        const token = jwt.sign({ userId: result.user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: result.user.id,
                nomeCompleto: result.user.nomeCompleto,
                email: result.user.email
            }
        });
    }
    catch (error) {
        log.error(error, 'Erro ao registrar usuário');
        handleRouteError(error, res);
    }
});
// Login
router.post('/login', sensitiveRateLimiter, async (req, res) => {
    try {
        console.log('🔐 Login request received');
        console.log('🌐 Origin:', req.headers.origin);
        console.log('🍪 Request cookies:', req.cookies);
        const data = loginSchema.parse(req.body);
        const user = await prisma.user.findUnique({
            where: { email: data.email },
            include: { plano: true }
        });
        if (!user) {
            console.log('❌ User not found:', data.email);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const validPassword = await bcrypt.compare(data.senha, user.senha);
        if (!validPassword) {
            console.log('❌ Invalid password for user:', data.email);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        console.log('✅ User authenticated:', user.email);
        const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" } // Mudar de 15min para 7 dias
        );
        const refreshToken = jwt.sign({ userId: user.id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
        // Configurações de cookies baseadas no ambiente
        const isProduction = process.env.NODE_ENV === 'production';
        // Para cookies cross-domain (frontend em realtracker.site, backend em backtrack-msc1.onrender.com):
        // - DEVE usar sameSite: 'none' (permite cross-site)
        // - DEVE usar secure: true (HTTPS obrigatório com SameSite=None)
        // - DEVE ter CORS configurado com credentials: true
        const cookieOptions = {
            httpOnly: true,
            secure: true, // SEMPRE true para SameSite=None (mesmo em dev, usar HTTPS)
            sameSite: "none", // Permitir cookies cross-domain
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
            path: "/",
            // NÃO definir 'domain' - cookies serão enviados apenas para o domínio que os definiu
        };
        console.log('🍪 Cookie options:', { isProduction, cookieOptions });
        console.log('🍪 Setting cookies for origin:', req.headers.origin);
        // Definir cookies httpOnly
        res.cookie("access_token", accessToken, cookieOptions);
        res.cookie("refresh_token", refreshToken, cookieOptions);
        console.log('✅ Cookies set successfully');
        console.log('🍪 Set-Cookie headers:', res.getHeader('Set-Cookie'));
        // TEMPORÁRIO: Retornar tokens no body para usar com localStorage
        // até configurar subdomínio api.realtracker.site
        res.json({
            success: true,
            token: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 dias em ms
        });
    }
    catch (error) {
        log.error(error, 'Erro ao fazer login');
        handleRouteError(error, res);
    }
});
// Logout
router.post('/logout', (req, res) => {
    const cookieOptions = {
        path: "/",
        secure: true,
        sameSite: "none",
        httpOnly: true
    };
    res.clearCookie("access_token", cookieOptions);
    res.clearCookie("refresh_token", cookieOptions);
    res.json({ success: true });
});
// Refresh Token
router.post('/refresh', async (req, res) => {
    try {
        console.log('🔄 Refresh request - Cookies:', req.cookies);
        const refreshToken = req.cookies.refresh_token;
        if (!refreshToken) {
            console.log('❌ No refresh token in cookies');
            return res.status(401).json({ error: 'Refresh token ausente' });
        }
        console.log('✅ Refresh token found, verifying...');
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        });
        if (!user) {
            console.log('❌ User not found for token');
            return res.status(401).json({ error: 'Usuário inválido' });
        }
        console.log('✅ User found, generating new tokens...');
        const newAccessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" } // Mudar para 7 dias
        );
        const newRefreshToken = jwt.sign({ userId: user.id }, process.env.REFRESH_SECRET, { expiresIn: "7d" });
        // Usar mesmas configurações dos outros cookies
        const cookieOptions = {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/"
        };
        res.cookie("access_token", newAccessToken, cookieOptions);
        res.cookie("refresh_token", newRefreshToken, cookieOptions);
        console.log('✅ New tokens set successfully');
        res.json({ success: true });
    }
    catch (err) {
        console.log('❌ Refresh token verification failed:', err);
        return res.status(401).json({ error: 'Refresh inválido' });
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
        const telegramUser = JSON.parse(userStr);
        const telegramId = String(telegramUser.id);
        // Buscar usuário pelo telegramId
        const user = await prisma.user.findFirst({
            where: { telegramId },
            include: { plano: true }
        });
        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado. Vincule sua conta do Telegram primeiro.' });
        }
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                id: user.id,
                nomeCompleto: user.nomeCompleto,
                email: user.email,
                plano: user.plano
            }
        });
    }
    catch (error) {
        log.error(error, 'Erro ao fazer login via Telegram');
        handleRouteError(error, res);
    }
});
export default router;
//# sourceMappingURL=auth.routes.js.map