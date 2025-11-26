import rateLimit from 'express-rate-limit';
/**
 * Função segura para extrair o IP do cliente
 * Valida o IP e previne bypass do rate limiting
 */
const getClientIp = (req) => {
    // Tentar obter IP de várias fontes (em ordem de confiabilidade)
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const remoteAddress = req.socket.remoteAddress;
    // Se houver X-Forwarded-For, pegar o primeiro IP (o cliente real)
    if (forwarded) {
        const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
        const clientIp = ips[0]?.trim();
        if (clientIp && isValidIp(clientIp)) {
            return clientIp;
        }
    }
    // Se houver X-Real-IP
    if (realIp) {
        const ip = typeof realIp === 'string' ? realIp.trim() : realIp[0]?.trim();
        if (ip && isValidIp(ip)) {
            return ip;
        }
    }
    // Fallback para remoteAddress (já processado pelo trust proxy)
    if (remoteAddress) {
        return remoteAddress;
    }
    // Último fallback
    return 'unknown';
};
/**
 * Valida se uma string é um IP válido (IPv4 ou IPv6)
 */
const isValidIp = (ip) => {
    // IPv4: xxx.xxx.xxx.xxx
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    // IPv6: simplificado (aceita formatos básicos)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    if (ipv4Regex.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => {
            const num = parseInt(part, 10);
            return num >= 0 && num <= 255;
        });
    }
    return ipv6Regex.test(ip) || ip === '::1' || ip.startsWith('::ffff:');
};
/**
 * Rate limiter global - 200 requisições por 15 minutos
 *
 * NOTA: Se LOAD_TEST_MODE=true, os limites são aumentados temporariamente para testes de carga
 */
const isLoadTestMode = process.env.LOAD_TEST_MODE === 'true';
/**
 * Rate limiter global - 500 requisições por 15 minutos (aumentado para permitir operações normais)
 * Pula rotas que têm rate limiters específicos (atualização de apostas)
 */
export const globalRateLimiter = rateLimit({
    windowMs: isLoadTestMode ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 minuto em modo teste, 15 minutos normal
    max: isLoadTestMode ? 1000 : 500, // 1000 requisições em modo teste, 500 normal (aumentado de 200)
    message: {
        error: 'Muitas requisições deste IP, tente novamente em alguns minutos.'
    },
    standardHeaders: true, // Retorna rate limit info nos headers `RateLimit-*`
    legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
    // Pular rate limiting para rotas que têm rate limiters específicos
    skip: (req) => {
        // Pular para rotas de atualização de apostas (elas têm rate limiter próprio)
        const path = req.path || req.url || '';
        return path.includes('/api/apostas/') && req.method === 'PUT' ||
            path.includes('/api/telegram/update-bet-message/');
    },
    // Função customizada para identificar o IP de forma segura
    keyGenerator: (req) => {
        return getClientIp(req);
    },
    // Função para identificar o IP (útil para proxies/load balancers)
    handler: (req, res) => {
        res.status(429).json({
            error: 'Muitas requisições deste IP, tente novamente em alguns minutos.',
            retryAfter: Math.ceil(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900)
        });
    }
});
/**
 * Rate limiter para rotas sensíveis - 10 requisições por 5 minutos
 * Aplicar em: login, register, alteração de senha, reset de conta
 *
 * NOTA: Se LOAD_TEST_MODE=true, os limites são aumentados temporariamente para testes de carga
 */
export const sensitiveRateLimiter = rateLimit({
    windowMs: isLoadTestMode ? 1 * 60 * 1000 : 5 * 60 * 1000, // 1 minuto em modo teste, 5 minutos normal
    max: isLoadTestMode ? 200 : 10, // 200 requisições em modo teste, 10 normal
    message: {
        error: 'Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar novamente.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Conta todas as requisições, mesmo as bem-sucedidas
    // Função customizada para identificar o IP de forma segura
    keyGenerator: (req) => {
        return getClientIp(req);
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Muitas tentativas. Por segurança, aguarde alguns minutos antes de tentar novamente.',
            retryAfter: Math.ceil(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 300)
        });
    }
});
/**
 * Rate limiter para rotas de atualização de apostas - mais permissivo
 * 100 requisições por 15 minutos (mais permissivo que o global para operações normais)
 */
export const betUpdateRateLimiter = rateLimit({
    windowMs: isLoadTestMode ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 minuto em modo teste, 15 minutos normal
    max: isLoadTestMode ? 500 : 100, // 500 requisições em modo teste, 100 normal
    message: {
        error: 'Muitas requisições de atualização. Aguarde alguns minutos antes de tentar novamente.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Não conta requisições bem-sucedidas (permite mais tentativas)
    // Função customizada para identificar o IP de forma segura
    keyGenerator: (req) => {
        return getClientIp(req);
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Muitas requisições de atualização. Aguarde alguns minutos antes de tentar novamente.',
            retryAfter: Math.ceil(req.rateLimit?.resetTime ? (req.rateLimit.resetTime - Date.now()) / 1000 : 900)
        });
    }
});
//# sourceMappingURL=rateLimiter.js.map