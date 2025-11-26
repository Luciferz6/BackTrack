import express from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/auth.middleware.js";
import dotenv from "dotenv";
import { processTicket } from "../services/ticketProcessor.js";
import { log } from "../utils/logger.js";
dotenv.config();
const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        }
        else {
            cb(new Error("Apenas imagens são permitidas"));
        }
    }
});
router.post("/bilhete", authenticateToken, (req, res, next) => {
    upload.single("image")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ error: "Arquivo muito grande. Tamanho máximo: 10MB" });
            }
            return res.status(400).json({ error: "Erro ao fazer upload do arquivo", message: err.message });
        }
        if (err) {
            return res.status(400).json({ error: err.message || "Erro ao processar arquivo" });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Nenhuma imagem foi enviada" });
        }
        const base64Image = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;
        const ocrText = typeof req.body?.ocrText === "string" ? req.body.ocrText.trim() : "";
        const data = await processTicket({ base64Image, mimeType, ocrText });
        return res.json({
            success: true,
            data
        });
    }
    catch (error) {
        log.error(error, "Erro inesperado ao processar bilhete");
        if (res.headersSent) {
            return;
        }
        res.status(500).json({
            error: "Erro ao processar bilhete",
            message: "Não foi possível ler o bilhete. Tente novamente em instantes."
        });
    }
});
export default router;
//# sourceMappingURL=upload.routes.js.map