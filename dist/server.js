import express from 'express';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma.js';
import { corsMiddleware } from './middleware/cors.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { log } from './utils/logger.js';
import authRoutes from './routes/auth.routes.js';
import bancaRoutes from './routes/banca.routes.js';
import financeiroRoutes from './routes/financeiro.routes.js';
import apostaRoutes from './routes/aposta.routes.js';
import analiseRoutes from './routes/analise.routes.js';
import perfilRoutes from './routes/perfil.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import tipsterRoutes from './routes/tipster.routes.js';
import telegramRoutes from './routes/telegram.routes.js';
dotenv.config();
const app = express();
// Configurar trust proxy para funcionar corretamente com rate limiting em ambientes com proxy/load balancer
// 1 = confiar apenas no primeiro proxy (Render, Vercel, Railway geralmente têm 1 proxy)
// Isso é mais seguro que 'true' que confia em todos os proxies
app.set('trust proxy', 1);
// Middlewares globais
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' })); // Limite de tamanho do body
// Aplicar rate limiting global apenas em produção
if (process.env.NODE_ENV === 'production') {
    app.use(globalRateLimiter);
}
// Exemplo de uso: proteger rotas sensíveis
// Rota para obter o token CSRF
// ...existing code...
// Keep-alive endpoint para monitoramento (ex: UptimeRobot)
app.get('/', (req, res) => {
    res.send('Backend funcionando!');
    log.info('Ping recebido do UptimeRobot');
});
// Informações gerais da API
app.get('/info', (req, res) => {
    res.json({
        message: 'API Backend Planilha',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            info: '/info',
            auth: '/api/auth',
            bancas: '/api/bancas',
            financeiro: '/api/financeiro',
            apostas: '/api/apostas',
            analise: '/api/analise',
            perfil: '/api/perfil',
            upload: '/api/upload',
            tipsters: '/api/tipsters',
            telegram: '/api/telegram'
        }
    });
});
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bancas', bancaRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/apostas', apostaRoutes);
app.use('/api/analise', analiseRoutes);
app.use('/api/perfil', perfilRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tipsters', tipsterRoutes);
app.use('/api/telegram', telegramRoutes);
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    log.info(`Server running on port ${PORT}`);
});
// Initialize default plan (fallback - use init.ts script instead)
async function initializeDatabase() {
    try {
        // Testar conexão com o banco primeiro
        await prisma.$connect();
        const defaultPlan = await prisma.plan.findUnique({
            where: { nome: 'Gratuito' }
        });
        if (!defaultPlan) {
            log.warn('Plano Gratuito não encontrado. Execute: npm run init:db');
        }
        else {
            log.info('Banco de dados conectado com sucesso');
        }
    }
    catch (error) {
        // Tratamento mais específico de erros de conexão
        const dbError = error;
        if (dbError?.code === 'P1001' || dbError?.message?.includes("Can't reach database server")) {
            log.error({
                code: dbError.code,
                message: dbError.message,
                details: 'Erro de conexão com o banco de dados'
            }, 'Erro de conexão com o banco de dados');
            log.warn('Verifique se o arquivo .env está configurado corretamente');
            log.warn('Verifique se o servidor de banco de dados está acessível');
            log.warn('Consulte ENV_SETUP.md para mais informações');
        }
        else {
            log.error(error, 'Erro ao verificar plano padrão');
        }
        // Não encerra o servidor, apenas loga o erro
    }
    finally {
        // Não desconecta aqui, mantém a conexão para uso nas rotas
    }
}
// Inicializar em background sem bloquear o servidor
initializeDatabase();
//# sourceMappingURL=server.js.map