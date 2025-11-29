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
  console.log('🔐 Auth middleware - Request headers:', {
    origin: req.headers.origin,
    authorization: req.headers.authorization ? 'Bearer ***' : 'none',
    cookie: req.headers.cookie ? 'present' : 'none'
  });
  
  console.log('🍪 Auth middleware - Cookies:', req.cookies);
  
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Check query parameter token
  if (!token && typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  // Check httpOnly cookie (for production cookie-based auth)
  if (!token && req.cookies?.access_token) {
    token = req.cookies.access_token;
    console.log('✅ Using token from cookie');
  }

  if (!token) {
    console.log('❌ No token found in headers, query, or cookies');
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  console.log('✅ Token found, validating...');

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'JWT_SECRET não configurado' });
  }

  jwt.verify(token, secret, (err: jwt.VerifyErrors | null, decoded: string | JwtPayload | undefined) => {
    if (err) {
      console.log('❌ Token verification failed:', err.message);
      return res.status(403).json({ error: 'Token inválido' });
    }
    
    const payload = decoded as DecodedToken;
    if (!payload?.userId) {
      console.log('❌ Token missing userId');
      return res.status(403).json({ error: 'Token inválido: userId não encontrado' });
    }
    
    console.log('✅ Token valid for userId:', payload.userId);
    req.userId = payload.userId;
    next();
  });
};
