import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger.js';

// Estender interface Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        iat: number;
        exp: number;
      };
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;

  if (!token) {
    log.warn({ ip: req.ip, userAgent: req.get('User-Agent') }, 'Tentativa de acesso sem token');
    return res.status(401).json({ error: "no_token" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      iat: number;
      exp: number;
    };
    next();
  } catch (err) {
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
