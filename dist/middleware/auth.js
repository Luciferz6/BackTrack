import jwt from 'jsonwebtoken';
import { log } from '../utils/logger.js';
export const authenticate = (req, res, next) => {
    const token = req.cookies.access_token;
    if (!token) {
        log.warn({ ip: req.ip, userAgent: req.get('User-Agent') }, 'Tentativa de acesso sem token');
        return res.status(401).json({ error: "no_token" });
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    }
    catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            log.warn({ ip: req.ip }, 'Token expirado');
            return res.status(401).json({ error: "expired" });
        }
        if (err instanceof jwt.JsonWebTokenError) {
            log.warn({ ip: req.ip }, 'Token inválido');
            return res.status(401).json({ error: "invalid" });
        }
        log.error({ err, ip: req.ip }, 'Erro inesperado na validação de token');
        return res.status(401).json({ error: "invalid" });
    }
};
//# sourceMappingURL=auth.js.map