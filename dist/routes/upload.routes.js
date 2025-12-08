import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
const router = express.Router();
const BILHETE_TRACKER_BASE = (process.env.BILHETE_TRACKER_URL || 'https://bilhetetracker.onrender.com').replace(/\/$/, '');
const BILHETE_TRACKER_UPLOAD_ENDPOINT = `${BILHETE_TRACKER_BASE}/api/scan-ticket/upload`;
// Obter __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Configuração do multer para upload em memória
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // Limite de 5MB
    },
    fileFilter: (req, file, cb) => {
        // Aceitar apenas imagens
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Apenas imagens JPG, PNG ou WEBP são permitidas'));
        }
    }
});
// POST /api/upload/perfil - Upload de foto de perfil
router.post('/perfil', authenticate, upload.single('foto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }
        const userId = req.user.userId;
        // Processar e redimensionar a imagem com sharp
        const processedBuffer = await sharp(req.file.buffer)
            .resize(300, 300, {
            fit: 'cover',
            position: 'center'
        })
            .webp({ quality: 85 })
            .toBuffer();
        // Converter para base64 data URI
        const base64 = processedBuffer.toString('base64');
        const dataUri = `data:image/webp;base64,${base64}`;
        // Atualizar data URI da foto no banco de dados
        await prisma.user.update({
            where: { id: userId },
            data: { fotoPerfil: dataUri }
        });
        log.info({ userId, size: processedBuffer.length }, 'Foto de perfil atualizada (base64)');
        res.json({
            message: 'Foto de perfil atualizada com sucesso',
            url: dataUri
        });
    }
    catch (error) {
        log.error(error, 'Erro ao fazer upload da foto');
        if (error.message.includes('Apenas imagens')) {
            return res.status(400).json({ error: error.message });
        }
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo muito grande. O tamanho máximo é 5MB' });
        }
        res.status(500).json({ error: 'Erro ao processar imagem' });
    }
});
// POST /api/upload/bilhete - Processar bilhete usando IA
router.post('/bilhete', authenticate, upload.single('image'), async (req, res) => {
    let abortTimeout = null;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });
        }
        const ocrText = typeof req.body?.ocrText === 'string' ? req.body.ocrText : undefined;
        let processedBuffer = req.file.buffer;
        let processedMime = req.file.mimetype;
        let processedFilename = req.file.originalname || `bilhete-${Date.now()}`;
        try {
            const optimized = await sharp(req.file.buffer)
                .rotate()
                .resize({
                width: 1800,
                height: 1800,
                fit: 'inside',
                withoutEnlargement: true,
            })
                .webp({ quality: 90, effort: 4 })
                .toBuffer();
            log.info({
                originalSize: req.file.size,
                optimizedSize: optimized.length,
            }, 'Imagem de bilhete otimizada para upload');
            processedBuffer = optimized;
            processedMime = 'image/webp';
            processedFilename = `${processedFilename.replace(/\.[^/.]+$/, '')}.webp`;
        }
        catch (imageError) {
            log.warn({ err: imageError }, 'Falha ao otimizar imagem de bilhete, seguindo com buffer original');
        }
        const formData = new FormData();
        formData.append('image', processedBuffer, {
            filename: processedFilename || `bilhete-${Date.now()}.webp`,
            contentType: processedMime,
        });
        if (ocrText) {
            formData.append('ocrText', ocrText);
        }
        const controller = new AbortController();
        abortTimeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout para evitar requests presos
        req.on('close', () => {
            if (!res.writableEnded) {
                controller.abort();
            }
        });
        const response = await fetch(BILHETE_TRACKER_UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
            signal: controller.signal,
        });
        const payload = (await response
            .json()
            .catch(() => ({ success: false, error: 'Resposta inválida do serviço de bilhetes' })));
        if (!response.ok || payload?.success === false) {
            const message = payload?.error ||
                payload?.message ||
                `Serviço de bilhetes retornou status ${response.status}`;
            log.warn({ status: response.status }, 'Falha ao processar bilhete via serviço externo');
            return res.status(response.status).json({ success: false, error: message });
        }
        log.info({ userId: req.user?.userId }, 'Bilhete processado com sucesso via serviço externo');
        // Map BilheteTracker response format (ticket) to frontend format (data)
        const frontendResponse = {
            success: payload.success,
            data: payload.ticket, // BilheteTracker returns 'ticket', frontend expects 'data'
            message: payload.message
        };
        return res.json(frontendResponse);
    }
    catch (error) {
        log.error({ err: error }, 'Erro ao processar bilhete via upload');
        const message = error instanceof Error
            ? error.message
            : typeof error === 'string'
                ? error
                : 'Erro ao processar bilhete. Tente novamente mais tarde.';
        const abortedByClient = req.aborted;
        const isAbortError = error instanceof Error && error.name === 'AbortError';
        const statusCode = abortedByClient ? 499 : isAbortError ? 504 : 502;
        return res.status(statusCode).json({
            success: false,
            error: message,
        });
    }
    finally {
        if (abortTimeout) {
            clearTimeout(abortTimeout);
        }
    }
});
// DELETE /api/upload/perfil - Remover foto de perfil
router.delete('/perfil', authenticate, async (req, res) => {
    try {
        const userId = req.user.userId;
        // Buscar foto atual
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fotoPerfil: true }
        });
        if (!user?.fotoPerfil) {
            return res.status(404).json({ error: 'Nenhuma foto de perfil encontrada' });
        }
        // Remover data URI do banco de dados
        await prisma.user.update({
            where: { id: userId },
            data: { fotoPerfil: null }
        });
        log.info({ userId }, 'Foto de perfil removida com sucesso');
        res.json({ message: 'Foto de perfil removida com sucesso' });
    }
    catch (error) {
        log.error(error, 'Erro ao remover foto de perfil');
        res.status(500).json({ error: 'Erro ao remover foto de perfil' });
    }
});
export default router;
//# sourceMappingURL=upload.routes.js.map