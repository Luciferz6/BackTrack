import cors, { CorsOptions } from 'cors';
import { log } from '../utils/logger.js';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Lista de origens permitidas em produção
// Pode ser configurada via variável de ambiente separada por vírgulas
// Exemplo: ALLOWED_ORIGINS=http://localhost:5173,https://app.exemplo.com
const getAllowedOrigins = (): string[] | null => {
  if (isDevelopment) {
    // Em desenvolvimento, permitir qualquer origem
    return null; // null = permitir qualquer origem
  }

  // Em produção, usar lista branca
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  
  if (!allowedOriginsEnv) {
    // Se não configurado em produção, permitir qualquer origem mas avisar
    log.warn('⚠️  PRODUÇÃO: ALLOWED_ORIGINS não configurado. Permitindo qualquer origem.');
    log.warn('⚠️  Configure ALLOWED_ORIGINS no .env para maior segurança em produção.');
    return null; // null = permitir qualquer origem
  }

  // Separar por vírgula e limpar espaços
  const origins = allowedOriginsEnv
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
  
  log.info({ origins }, 'CORS configurado com lista branca');
  return origins;
};

const allowedOrigins = getAllowedOrigins();

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    console.log('🌐 [CORS] Requisição de origem:', origin);
    
    // Se allowedOrigins é null, permitir qualquer origem
    if (allowedOrigins === null) {
      console.log('✅ [CORS] Permitindo qualquer origem (dev mode ou não configurado)');
      return callback(null, true);
    }

    // Se não há origin (ex: requisições de mesma origem, Postman), permitir
    if (!origin) {
      console.log('✅ [CORS] Permitindo requisição sem origin (same-origin ou tool)');
      return callback(null, true);
    }

    // Verificar se a origem está na lista branca
    if (allowedOrigins.includes(origin)) {
      console.log('✅ [CORS] Origem permitida:', origin);
      callback(null, true);
    } else {
      console.log('❌ [CORS] Origem bloqueada:', origin);
      console.log('❌ [CORS] Origins permitidas:', allowedOrigins);
      log.warn({ origin, allowedOrigins }, 'Requisição bloqueada por CORS');
      callback(new Error('Não permitido por CORS'));
    }
  },
  credentials: true, // Permitir cookies/credenciais
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Limit', 'Set-Cookie']
};

export const corsMiddleware = cors(corsOptions);

