import jwt from 'jsonwebtoken';
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];
    if (!token && typeof req.query?.token === 'string') {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return res.status(500).json({ error: 'JWT_SECRET não configurado' });
    }
    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        const payload = decoded;
        if (!payload?.userId) {
            return res.status(403).json({ error: 'Token inválido: userId não encontrado' });
        }
        req.userId = payload.userId;
        next();
    });
};
//# sourceMappingURL=auth.middleware.js.map