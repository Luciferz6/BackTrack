import { ZodError } from 'zod';
/**
 * Handler centralizado de erros para rotas
 */
export function handleRouteError(error, res) {
    if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
        return;
    }
    const appError = error;
    // Erros do Prisma
    if (appError.code === 'P2002') {
        res.status(409).json({ error: 'Registro duplicado' });
        return;
    }
    if (appError.code === 'P2025') {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
    }
    // Erro genérico
    const statusCode = appError.statusCode || 500;
    const message = appError.message || 'Erro interno do servidor';
    res.status(statusCode).json({ error: message });
}
//# sourceMappingURL=errorHandler.js.map