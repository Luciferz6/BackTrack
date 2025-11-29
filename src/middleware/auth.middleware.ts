import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

interface DecodedToken extends JwtPayload {
  userId: string;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Check query parameter token
  if (!token && typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  // Check httpOnly cookie (for production cookie-based auth)
  if (!token && req.cookies?.access_token) {
    token = req.cookies.access_token;
    console.log(`🍪 Token found in cookies: ${req.method} ${req.originalUrl}`);
  } else {
    console.log(`🚫 No cookies found: ${req.method} ${req.originalUrl} - Headers:`, Object.keys(req.headers));
  }

  if (!token) {
    console.log(`❌ No token found - returning 401 for: ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'JWT_SECRET não configurado' });
  }

  jwt.verify(token, secret, (err: jwt.VerifyErrors | null, decoded: string | JwtPayload | undefined) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    const payload = decoded as DecodedToken;
    if (!payload?.userId) {
      return res.status(403).json({ error: 'Token inválido: userId não encontrado' });
    }
    
    req.userId = payload.userId;
    next();
  });
};
