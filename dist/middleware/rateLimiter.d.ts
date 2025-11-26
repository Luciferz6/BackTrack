import { RateLimitRequestHandler } from 'express-rate-limit';
/**
 * Rate limiter global - 500 requisições por 15 minutos (aumentado para permitir operações normais)
 * Pula rotas que têm rate limiters específicos (atualização de apostas)
 */
export declare const globalRateLimiter: RateLimitRequestHandler;
/**
 * Rate limiter para rotas sensíveis - 10 requisições por 5 minutos
 * Aplicar em: login, register, alteração de senha, reset de conta
 *
 * NOTA: Se LOAD_TEST_MODE=true, os limites são aumentados temporariamente para testes de carga
 */
export declare const sensitiveRateLimiter: RateLimitRequestHandler;
/**
 * Rate limiter para rotas de atualização de apostas - mais permissivo
 * 100 requisições por 15 minutos (mais permissivo que o global para operações normais)
 */
export declare const betUpdateRateLimiter: RateLimitRequestHandler;
//# sourceMappingURL=rateLimiter.d.ts.map