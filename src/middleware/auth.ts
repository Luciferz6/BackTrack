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
  console.log('🔐 [AUTH] Verificando autenticação');
  console.log('🔐 [AUTH] Origin:', req.headers.origin);
  console.log('🔐 [AUTH] Cookies recebidos:', req.cookies);
  console.log('🔐 [AUTH] access_token presente?', !!req.cookies?.access_token);
  
  const token = req.cookies.access_token;

  if (!token) {
    log.warn({ 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      origin: req.headers.origin,
      cookies: Object.keys(req.cookies || {})
    }, 'Tentativa de acesso sem token');
    console.log('❌ [AUTH] Token não encontrado nos cookies');
    return res.status(401).json({ error: "no_token" });
  }

  console.log('✅ [AUTH] Token encontrado, verificando validade...');

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      iat: number;
      exp: number;
    };
    console.log('✅ [AUTH] Token válido para userId:', req.user.userId);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      log.warn({ ip: req.ip }, 'Token expirado');
      console.log('❌ [AUTH] Token expirado');
      return res.status(401).json({ error: "expired" });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      log.warn({ ip: req.ip }, 'Token inválido');
      console.log('❌ [AUTH] Token inválido:', err.message);
      return res.status(401).json({ error: "invalid" });
    }

    log.error({ err, ip: req.ip }, 'Erro inesperado na validação de token');
    console.log('❌ [AUTH] Erro inesperado:', err);
    return res.status(401).json({ error: "invalid" });
  }
};
