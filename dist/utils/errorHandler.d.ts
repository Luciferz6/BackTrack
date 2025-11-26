import { Response } from 'express';
/**
 * Tipo para erros conhecidos do sistema
 */
export interface AppError extends Error {
    statusCode?: number;
    code?: string;
}
/**
 * Handler centralizado de erros para rotas
 */
export declare function handleRouteError(error: unknown, res: Response): void;
//# sourceMappingURL=errorHandler.d.ts.map