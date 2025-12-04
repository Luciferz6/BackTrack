import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { log } from '../utils/logger.js';
import { processTicket } from '../services/ticketProcessor.js';
const router = express.Router();
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
        // Gerar nome único para o arquivo
        const filename = `perfil-${userId}-${Date.now()}.webp`;
        const uploadsDir = path.join(__dirname, '../../uploads/perfil');
        const filepath = path.join(uploadsDir, filename);
        // Garantir que o diretório existe
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        // Processar e redimensionar a imagem com sharp
        await sharp(req.file.buffer)
            .resize(300, 300, {
            fit: 'cover',
            position: 'center'
        })
            .webp({ quality: 85 })
            .toFile(filepath);
        // Construir URL com base no host atual para funcionar em qualquer ambiente
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fotoUrl = `${baseUrl}/uploads/perfil/${filename}`;
        // Buscar foto antiga para deletar
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fotoPerfil: true }
        });
        // Deletar foto antiga se existir
        if (user?.fotoPerfil) {
            try {
                const oldFilename = user.fotoPerfil.split('/').pop();
                if (oldFilename) {
                    const oldFilepath = path.join(uploadsDir, oldFilename);
                    if (fs.existsSync(oldFilepath)) {
                        fs.unlinkSync(oldFilepath);
                        log.info({ userId, oldFile: oldFilename }, 'Foto de perfil antiga deletada');
                    }
                }
            }
            catch (error) {
                log.error(error, 'Erro ao deletar foto antiga');
            }
        }
        // Atualizar URL da foto no banco de dados
        await prisma.user.update({
            where: { id: userId },
            data: { fotoPerfil: fotoUrl }
        });
        log.info({ userId, filename }, 'Foto de perfil enviada com sucesso');
        res.json({
            message: 'Foto de perfil atualizada com sucesso',
            url: fotoUrl
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
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });
        }
        const mimeType = req.file.mimetype;
        const base64Image = req.file.buffer.toString('base64');
        const ocrText = typeof req.body?.ocrText === 'string' ? req.body.ocrText : undefined;
        const data = await processTicket({
            base64Image,
            mimeType,
            ocrText,
        });
        log.info({ userId: req.user?.userId }, 'Bilhete processado com sucesso via upload');
        return res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        log.error(error, 'Erro ao processar bilhete via upload');
        const message = error?.message ||
            (typeof error === 'string' ? error : 'Erro ao processar bilhete. Tente novamente mais tarde.');
        const statusCode = message.includes('nenhum provedor') || message.includes('não configurada') ? 503 : 500;
        return res.status(statusCode).json({
            success: false,
            error: message,
        });
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
        // Deletar arquivo físico
        try {
            const filename = user.fotoPerfil.split('/').pop();
            if (filename) {
                const uploadsDir = path.join(__dirname, '../../uploads/perfil');
                const filepath = path.join(uploadsDir, filename);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                    log.info({ userId, filename }, 'Foto de perfil deletada do sistema de arquivos');
                }
            }
        }
        catch (error) {
            log.error(error, 'Erro ao deletar arquivo físico');
        }
        // Remover URL do banco de dados
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