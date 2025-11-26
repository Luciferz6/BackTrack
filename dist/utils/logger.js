import pino from 'pino';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
// Criar diretório de logs se não existir
const logsDir = join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
}
// Configuração base do logger
const pinoConfig = {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Em desenvolvimento, usar formatação mais legível
    ...(isDevelopment && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    })
};
// Criar logger base
const baseLogger = pino(pinoConfig);
// Streams para diferentes tipos de log
const streams = [];
// Em produção, adicionar stream para arquivo
if (isProduction) {
    // Stream para logs gerais
    streams.push({
        level: 'info',
        stream: pino.destination({
            dest: join(logsDir, 'app.log'),
            sync: false, // Async para melhor performance
            mkdir: true
        })
    });
    // Stream para logs de erro
    streams.push({
        level: 'error',
        stream: pino.destination({
            dest: join(logsDir, 'error.log'),
            sync: false,
            mkdir: true
        })
    });
}
// Criar logger final
const logger = streams.length > 0
    ? pino(pinoConfig, pino.multistream(streams))
    : baseLogger;
// Exportar logger com métodos auxiliares
export const log = {
    info: (obj, msg) => {
        if (typeof obj === 'string') {
            logger.info({ msg: obj });
        }
        else {
            logger.info(obj, msg);
        }
    },
    error: (obj, msg) => {
        if (obj instanceof Error) {
            logger.error({
                err: {
                    message: obj.message,
                    stack: obj.stack,
                    name: obj.name
                }
            }, msg || obj.message);
        }
        else if (typeof obj === 'string') {
            logger.error({ msg: obj });
        }
        else if (typeof obj === 'object' && obj !== null) {
            logger.error(obj, msg);
        }
        else {
            logger.error({ error: String(obj) }, msg);
        }
    },
    warn: (obj, msg) => {
        if (typeof obj === 'string') {
            logger.warn({ msg: obj });
        }
        else {
            logger.warn(obj, msg);
        }
    },
    debug: (obj, msg) => {
        if (typeof obj === 'string') {
            logger.debug({ msg: obj });
        }
        else {
            logger.debug(obj, msg);
        }
    }
};
export default logger;
//# sourceMappingURL=logger.js.map