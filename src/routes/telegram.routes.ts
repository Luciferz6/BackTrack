import express from 'express';
import fetch from 'node-fetch';
import type { Bankroll, Bet } from '@prisma/client';
import { config } from 'dotenv';
import { prisma } from '../lib/prisma.js';
import { processTicket } from '../services/ticketProcessor.js';
import type { NormalizedTicketData } from '../services/ticketProcessor.js';
import { emitBetEvent } from '../utils/betEvents.js';
import { log } from '../utils/logger.js';
import { betUpdateRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

config();

const getTelegramBotToken = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN não configurado no .env');
  }
  return token;
};

const getSupportBotToken = () => {
  // Token do bot de suporte (opcional, se não configurado usa o token principal)
  return process.env.TELEGRAM_SUPPORT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
};

const ensureConfig = () => {
  getTelegramBotToken();
};

const BILHETE_TRACKER_BASE = (process.env.BILHETE_TRACKER_URL || 'https://bilhetetracker.onrender.com').replace(/\/$/, '');
const BILHETE_TRACKER_SCAN_ENDPOINT = `${BILHETE_TRACKER_BASE}/api/scan-ticket`;
const BILHETE_TRACKER_TIMEOUT_MS = parseInt(process.env.BILHETE_TRACKER_TIMEOUT_MS || '60000', 10);

type BilheteTrackerTicket = {
  casaDeAposta?: string;
  tipster?: string;
  esporte?: string;
  jogo?: string;
  torneio?: string;
  pais?: string;
  mercado?: string;
  tipoAposta?: string;
  valorApostado?: number;
  odd?: number;
  dataJogo?: string;
  status?: string;
};

type BilheteTrackerResponse = {
  success?: boolean;
  ticket?: BilheteTrackerTicket;
  error?: string;
  message?: string;
};

const normalizeBilheteTrackerTicket = (ticket: BilheteTrackerTicket): NormalizedTicketData => ({
  casaDeAposta: ticket.casaDeAposta || '',
  tipster: ticket.tipster || '',
  esporte: ticket.esporte || '',
  jogo: ticket.jogo || '',
  torneio: ticket.torneio || '',
  pais: ticket.pais || 'Mundo',
  mercado: ticket.mercado || '',
  tipoAposta: ticket.tipoAposta || 'Simples',
  valorApostado: typeof ticket.valorApostado === 'number' ? ticket.valorApostado : Number(ticket.valorApostado) || 0,
  odd: typeof ticket.odd === 'number' ? ticket.odd : Number(ticket.odd) || 0,
  dataJogo: ticket.dataJogo || '',
  status: ticket.status || 'Pendente'
});

const processTicketViaBilheteTracker = async (base64Image: string, mimeType: string, ocrText?: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BILHETE_TRACKER_TIMEOUT_MS);

  try {
    const payload = {
      image: `data:${mimeType};base64,${base64Image}`,
      ...(ocrText?.trim() ? { ocrText } : {})
    };

    const response = await fetch(BILHETE_TRACKER_SCAN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = (await response.json().catch(() => {
      throw new Error('Resposta inválida do serviço de bilhetes');
    })) as BilheteTrackerResponse;

    if (!response.ok || !data?.success || !data.ticket) {
      const message = data?.error || data?.message || `Serviço de bilhetes retornou status ${response.status}`;
      throw new Error(message);
    }

    return normalizeBilheteTrackerTicket(data.ticket);
  } finally {
    clearTimeout(timeout);
  }
};

const extractCommandParam = (text?: string | null): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const [, ...rest] = trimmed.split(/\s+/);
  if (rest.length === 0) return null;
  const rawParam = rest.join(' ').trim();
  if (!rawParam) return null;
  try {
    return decodeURIComponent(rawParam);
  } catch {
    return rawParam;
  }
};

const normalizeAccountId = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleaned) return null;
  return cleaned.toLowerCase();
};

const sendTelegramMessage = async (chatId: number, text: string, replyMarkup?: any, replyToMessageId?: number, useSupportBot = false) => {
  try {
    const token = useSupportBot ? getSupportBotToken() : getTelegramBotToken();
    const body: any = { 
      chat_id: chatId, 
      text
    };
    
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
      console.log('=== ADICIONANDO REPLY_MARKUP ===');
      console.log('Reply Markup:', JSON.stringify(replyMarkup, null, 2));
      log.info({ 
        replyMarkup: JSON.stringify(replyMarkup),
        chatId 
      }, 'Adicionando reply_markup à mensagem');
    }
    
    if (replyToMessageId) {
      body.reply_to_message_id = replyToMessageId;
      console.log('Reply to message ID:', replyToMessageId);
    }
    
    console.log('=== ENVIANDO MENSAGEM AO TELEGRAM ===');
    console.log('Chat ID:', chatId);
    console.log('Tem reply_markup?', !!replyMarkup);
    console.log('Body completo:', JSON.stringify(body, null, 2));
    
    log.info({ 
      chatId,
      textLength: text.length,
      hasReplyMarkup: !!replyMarkup,
      replyMarkupType: replyMarkup ? typeof replyMarkup : 'none',
      textPreview: text.substring(0, 200)
    }, 'Enviando mensagem ao Telegram');
    
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    console.log('=== RESPOSTA DO TELEGRAM ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      log.error({ 
        status: response.status,
        statusText: response.statusText,
        errorText,
        chatId,
        hasReplyMarkup: !!replyMarkup
      }, 'Erro HTTP ao enviar mensagem ao Telegram');
      return { ok: false, description: errorText, error_code: response.status };
    }
    
    const result = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string; error_code?: number };
    
    console.log('Resultado:', JSON.stringify(result, null, 2));
    
    if (!result.ok) {
      console.error('=== ERRO AO ENVIAR MENSAGEM ===');
      console.error('Erro:', result.description);
      console.error('Código:', result.error_code);
      console.error('Body enviado:', JSON.stringify(body, null, 2));
      
      // Se o erro for relacionado a web_app, tentar novamente com callbacks
      if (result.description?.includes('web_app') || result.description?.includes('webapp')) {
        console.warn('⚠️ Erro com Web App, tentando com callbacks...');
        // Não fazer nada aqui, apenas logar - o fallback já está na função createBetInlineKeyboard
      }
      log.error({ 
        error: result.description, 
        code: result.error_code,
        chatId,
        hasReplyMarkup: !!replyMarkup,
        replyMarkup: replyMarkup ? JSON.stringify(replyMarkup) : 'none',
        textPreview: text.substring(0, 100),
        fullResult: JSON.stringify(result)
      }, 'Erro ao enviar mensagem ao Telegram');
    } else {
      console.log('=== MENSAGEM ENVIADA COM SUCESSO ===');
      console.log('Message ID:', result.result?.message_id);
      console.log('Tem reply_markup?', !!replyMarkup);
      log.info({ 
        chatId,
        messageId: result.result?.message_id,
        hasReplyMarkup: !!replyMarkup
      }, 'Mensagem enviada com sucesso ao Telegram');
    }
    
    return result;
  } catch (error) {
    log.error({ 
      error,
      chatId,
      hasReplyMarkup: !!replyMarkup
    }, 'Falha ao enviar mensagem ao Telegram');
    return null;
  }
};

const answerCallbackQuery = async (callbackQueryId: string, text?: string, showAlert = false, url?: string) => {
  try {
    const token = getTelegramBotToken();
    const body: any = {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    };
    
    if (url) {
      body.url = url;
    }
    
    console.log('=== RESPONDENDO CALLBACK QUERY ===');
    console.log('Callback Query ID:', callbackQueryId);
    console.log('Text:', text);
    console.log('Show Alert:', showAlert);
    
    log.info({ 
      callbackQueryId, 
      hasText: !!text, 
      text, 
      showAlert 
    }, 'Respondendo callback query');
    
    const response = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      log.error({ 
        status: response.status,
        statusText: response.statusText,
        errorText,
        callbackQueryId
      }, 'Erro HTTP ao responder callback query');
      return;
    }
    
    const result = await response.json() as { ok: boolean; description?: string };
    if (!result.ok) {
      log.error({ 
        result, 
        callbackQueryId 
      }, 'Erro ao responder callback query');
    } else {
      log.info({ callbackQueryId }, 'Callback query respondido com sucesso');
    }
  } catch (error) {
    log.error({ error, callbackQueryId }, 'Falha ao responder callback query');
  }
};

const editMessageText = async (chatId: number, messageId: number, text: string, replyMarkup?: any) => {
  try {
    const token = getTelegramBotToken();
    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text
    };
    
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    
    console.log('=== EDITANDO MENSAGEM ===');
    console.log('Chat ID:', chatId);
    console.log('Message ID:', messageId);
    console.log('Tem reply_markup?', !!replyMarkup);
    console.log('Body:', JSON.stringify(body, null, 2));
    
    const response = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro ao editar mensagem:', errorText);
      log.error({ 
        status: response.status,
        errorText,
        chatId,
        messageId
      }, 'Erro HTTP ao editar mensagem');
      return;
    }
    
    const result = await response.json() as { ok: boolean; description?: string };
    if (!result.ok) {
      console.error('Erro ao editar mensagem:', result.description);
      log.error({ result, chatId, messageId }, 'Erro ao editar mensagem');
    } else {
      console.log('Mensagem editada com sucesso');
      log.info({ chatId, messageId }, 'Mensagem editada com sucesso');
    }
  } catch (error) {
    console.error('Falha ao editar mensagem:', error);
    log.error(error, 'Falha ao editar mensagem do Telegram');
  }
};

const deleteMessage = async (chatId: number, messageId: number) => {
  try {
    const token = getTelegramBotToken();
    await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    });
  } catch (error) {
    log.error(error, 'Falha ao deletar mensagem do Telegram');
  }
};

const downloadTelegramFile = async (fileId: string) => {
  ensureConfig();
  const token = getTelegramBotToken();
  const fileInfoResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoResp.json() as { result?: { file_path?: string } };
  const filePath = fileInfo?.result?.file_path;
  if (!filePath) {
    throw new Error('Não foi possível obter o arquivo do Telegram');
  }
  const fileResp = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!fileResp.ok) {
    throw new Error('Falha ao baixar arquivo do Telegram');
  }
  const buffer = Buffer.from(await fileResp.arrayBuffer());
  return { base64: buffer.toString('base64'), filePath };
};

const formatBetMessage = (bet: Bet, banca: Bankroll) => {
  try {
    const formatCurrency = (value: number) => {
      if (!value || isNaN(value)) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    };

    const formatDate = (date: Date | string | null) => {
      if (!date) return 'N/D';
      try {
        return new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(new Date(date));
      } catch {
        return 'N/D';
      }
    };

    const formatTime = (date: Date | string | null) => {
      if (!date) return 'N/D';
      try {
        return new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(new Date(date));
      } catch {
        return 'N/D';
      }
    };

    const valorApostado = bet.valorApostado || 0;
    const odd = bet.odd || 1;
    const retornoPotencial = valorApostado * odd;
    
    const lucroPrejuizo = bet.status === 'Ganha' && bet.retornoObtido
      ? bet.retornoObtido - valorApostado
      : bet.status === 'Perdida'
      ? -valorApostado
      : null;

    let lucroPrejuizoText = 'Sem lucro ou prejuízo.';
    if (lucroPrejuizo !== null) {
      if (lucroPrejuizo > 0) {
        lucroPrejuizoText = `Lucro: ${formatCurrency(lucroPrejuizo)}`;
      } else if (lucroPrejuizo < 0) {
        lucroPrejuizoText = `Prejuízo: ${formatCurrency(Math.abs(lucroPrejuizo))}`;
      } else {
        lucroPrejuizoText = 'Sem lucro ou prejuízo.';
      }
    }

    const statusEmoji = bet.status === 'Ganha' ? '✅' : bet.status === 'Perdida' ? '❌' : '⏳';
    const statusText = `${statusEmoji} Status: ${bet.status || 'Pendente'}`;

    // Formatar a linha de aposta priorizando o mercado detalhado quando existir
    const apostaText = bet.mercado && bet.mercado !== 'N/D'
      ? bet.mercado
      : bet.jogo || 'N/D';

    return `✅ Bilhete processado com sucesso

🆔 ID: ${bet.id}
💰 Banca: ${banca?.nome || 'N/D'}
${statusText}
💎 ${lucroPrejuizoText}
🏀 Esporte: ${bet.esporte || 'N/D'}
🏆 Torneio: ${bet.torneio || 'N/D'}
⚔️ Evento: ${bet.jogo || 'N/D'}
🎯 Aposta: ${apostaText}
💵 Valor Apostado: ${formatCurrency(valorApostado)}
📊 Odd: ${odd}
💚 Retorno Potencial: ${formatCurrency(retornoPotencial)}
📄 Tipo: ${bet.tipoAposta || 'Simples'}
📅 Data: ${formatDate(bet.dataJogo)}
🎁 Bônus: ${(bet.bonus || 0) > 0 ? formatCurrency(bet.bonus) : 'Não'}
🏠 Casa: ${bet.casaDeAposta || 'N/D'}
👤 Tipster: ${bet.tipster || 'N/D'}`;
  } catch (error) {
    log.error(error, 'Erro ao formatar mensagem da aposta');
    return `✅ Bilhete processado com sucesso!\n\n🆔 ID: ${bet.id}\n💰 Banca: ${banca?.nome || 'N/D'}\n🏀 Esporte: ${bet.esporte || 'N/D'}`;
  }
};

const createBetInlineKeyboard = (betId: string, messageId?: number, chatId?: number) => {
  const frontendUrl = process.env.FRONTEND_URL;
  const excluirCallback = `excluir_${betId}`;
  const editarCallback = `editar_${betId}`;
  const statusCallback = `alterar_status_${betId}`;
  
  // Verificar tamanho dos callbacks (limite do Telegram: 64 bytes)
  const maxCallbackSize = 64;
  const excluirSize = Buffer.byteLength(excluirCallback, 'utf8');
  const editarSize = Buffer.byteLength(editarCallback, 'utf8');
  const statusSize = Buffer.byteLength(statusCallback, 'utf8');
  
  console.log('=== CRIANDO BOTÕES INLINE ===');
  console.log('Bet ID:', betId);
  console.log('Message ID:', messageId);
  console.log('Chat ID:', chatId);
  console.log('Editar callback:', editarCallback, `(${editarSize} bytes)`);
  console.log('Excluir callback:', excluirCallback, `(${excluirSize} bytes)`);
  console.log('Status callback:', statusCallback, `(${statusSize} bytes)`);
  console.log('Frontend URL:', frontendUrl);
  
  if (editarSize > maxCallbackSize || excluirSize > maxCallbackSize || statusSize > maxCallbackSize) {
    console.error('ERRO: Callback data excede limite do Telegram!');
    log.error({ 
      betId, 
      editarSize,
      excluirSize,
      statusSize,
      maxCallbackSize 
    }, 'Callback data excede limite do Telegram!');
  }
  
  // Criar URLs para Web Apps (com https:// se necessário)
  let editWebAppUrl: string | null = null;
  let statusWebAppUrl: string | null = null;
  
  if (frontendUrl) {
    // Garantir que a URL tenha https://
    let baseUrl = frontendUrl.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    // Remover barra final se houver
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // Incluir messageId e chatId na URL se disponíveis
    if (messageId && chatId) {
      editWebAppUrl = `${baseUrl}/telegram/edit?betId=${betId}&messageId=${messageId}&chatId=${chatId}`;
      statusWebAppUrl = `${baseUrl}/telegram/status?betId=${betId}&messageId=${messageId}&chatId=${chatId}`;
    } else {
      editWebAppUrl = `${baseUrl}/telegram/edit?betId=${betId}`;
      statusWebAppUrl = `${baseUrl}/telegram/status?betId=${betId}`;
    }
    
    console.log('✅ URLs do Web App criadas:');
    console.log('  Editar:', editWebAppUrl);
    console.log('  Status:', statusWebAppUrl);
  }
  
  // Usar Web Apps se disponível, senão usar callbacks
  let keyboard: any;
  
  if (editWebAppUrl && statusWebAppUrl) {
    // Usar Web Apps para abrir modais automaticamente
    keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Editar', web_app: { url: editWebAppUrl } },
          { text: '🗑️ Excluir', callback_data: excluirCallback }
        ],
        [
          { text: '📚 Alterar Status', web_app: { url: statusWebAppUrl } }
        ]
      ]
    };
    console.log('✅ Usando Web Apps para abrir modais automaticamente');
  } else {
    // Fallback: usar callbacks se não tiver frontend URL configurado
    keyboard = {
      inline_keyboard: [
        [
          { text: '✏️ Editar', callback_data: editarCallback },
          { text: '🗑️ Excluir', callback_data: excluirCallback }
        ],
        [
          { text: '📚 Alterar Status', callback_data: statusCallback }
        ]
      ]
    };
    console.warn('⚠️ FRONTEND_URL não configurado ou inválido, usando callbacks');
    console.warn('   Configure FRONTEND_URL com a URL completa (ex: https://seu-frontend.vercel.app)');
  }
  
  console.log('Keyboard criado:', JSON.stringify(keyboard, null, 2));
  console.log('Número de linhas:', keyboard.inline_keyboard.length);
  console.log('Total de botões:', keyboard.inline_keyboard.reduce((acc: number, row: any[]) => acc + row.length, 0));
  
  // Validar estrutura do keyboard
  if (!keyboard || !keyboard.inline_keyboard || !Array.isArray(keyboard.inline_keyboard)) {
    console.error('ERRO CRÍTICO: Keyboard inválido!');
    throw new Error('Keyboard inválido ao criar botões inline');
  }
  
  if (keyboard.inline_keyboard.length === 0) {
    console.error('ERRO CRÍTICO: Keyboard sem botões!');
    throw new Error('Keyboard sem botões ao criar botões inline');
  }
  
  log.info({ 
    betId, 
    keyboard: JSON.stringify(keyboard),
    callbackDataEditar: editarCallback,
    callbackDataExcluir: excluirCallback,
    callbackDataStatus: statusCallback,
    sizes: { editarSize, excluirSize, statusSize },
    keyboardRows: keyboard.inline_keyboard.length,
    totalButtons: keyboard.inline_keyboard.reduce((acc: number, row: any[]) => acc + row.length, 0)
  }, 'Criando botões inline para aposta');
  
  return keyboard;
};

router.post('/webhook', async (req, res) => {
  try {
    ensureConfig();
    if (process.env.TELEGRAM_WEBHOOK_SECRET) {
      // Express normaliza headers para lowercase, mas vamos verificar ambas as formas
      const secret = req.headers['x-telegram-bot-api-secret-token'] || 
                     req.headers['X-Telegram-Bot-Api-Secret-Token'];
      
      if (!secret) {
        log.warn({ 
          headers: Object.keys(req.headers),
          allHeaders: Object.entries(req.headers).filter(([key]) => 
            key.toLowerCase().includes('telegram') || key.toLowerCase().includes('secret')
          )
        }, 'Webhook chamado sem secret token');
        return res.status(403).json({ error: 'Secret token não fornecido' });
      }
      
      if (typeof secret !== 'string' || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        log.warn({ 
          received: typeof secret === 'string' ? secret.substring(0, 5) + '...' : 'não é string',
          receivedLength: typeof secret === 'string' ? secret.length : 0,
          expected: process.env.TELEGRAM_WEBHOOK_SECRET?.substring(0, 5) + '...',
          expectedLength: process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0
        }, 'Secret token inválido');
        return res.status(403).json({ error: 'Secret token inválido' });
      }
    }

    const update = req.body;
    
    // Log no console também para garantir visibilidade
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Tipo:', update.callback_query ? 'CALLBACK_QUERY' : update.message ? 'MESSAGE' : 'UNKNOWN');
    console.log('Body completo:', JSON.stringify(update, null, 2));
    
    log.info({
      hasCallbackQuery: !!update.callback_query,
      hasMessage: !!update.message,
      updateType: update.callback_query ? 'callback_query' : update.message ? 'message' : 'unknown'
    }, 'Webhook recebido');
    
    // Processar callback queries (cliques em botões inline)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const callbackData = callbackQuery.data;
      const chatId = callbackQuery.message?.chat?.id;
      const messageId = callbackQuery.message?.message_id;
      const telegramUserId = String(callbackQuery.from.id);

      console.log('=== CALLBACK QUERY DETECTADO ===');
      console.log('Callback Data:', callbackData);
      console.log('Chat ID:', chatId);
      console.log('Message ID:', messageId);
      console.log('Telegram User ID:', telegramUserId);
      console.log('Callback Query ID:', callbackQuery.id);

      log.info({
        callbackData,
        chatId,
        messageId,
        telegramUserId,
        callbackQueryId: callbackQuery.id,
        fullCallback: JSON.stringify(callbackQuery)
      }, 'Callback query recebido - processando...');
      
      // Processar de forma assíncrona mas responder ao webhook rapidamente
      (async () => {
        try {

        if (!callbackData) {
          log.warn({ callbackQueryId: callbackQuery.id }, 'Callback sem data');
          await answerCallbackQuery(callbackQuery.id);
          return;
        }

        // Verificar se o usuário está vinculado
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramUserId },
          include: { bancas: { include: { apostas: true } } }
        });

        if (!user) {
          log.warn({ telegramUserId, callbackData }, 'Usuário não encontrado para callback');
          await answerCallbackQuery(callbackQuery.id, 'Usuário não encontrado. Vincule sua conta primeiro.', true);
          return;
        }

        log.info({ userId: user.id, callbackData }, 'Processando callback para usuário');

      // Processar exclusão de aposta
      if (callbackData.startsWith('excluir_')) {
        try {
          const betId = callbackData.replace('excluir_', '');
          console.log('=== PROCESSANDO EXCLUSÃO ===');
          console.log('Bet ID extraído:', betId);
          console.log('User ID:', user.id);
          
          log.info({ 
            betId, 
            userId: user.id, 
            callbackDataOriginal: callbackData,
            betIdLength: betId.length,
            betIdIsEmpty: !betId || betId.length === 0
          }, 'Processando exclusão de aposta');
          
          if (!betId || betId.length === 0) {
            console.error('ERRO: BetId vazio!');
            log.error({ callbackData }, 'BetId vazio ao processar exclusão');
            await answerCallbackQuery(callbackQuery.id, 'Erro: ID da aposta não encontrado.', true);
            return;
          }

          // Verificar se a aposta pertence ao usuário
          console.log('=== BUSCANDO APOSTA NO BANCO ===');
          console.log('Buscando aposta com ID:', betId);
          console.log('User ID:', user.id);
          
          const aposta = await prisma.bet.findFirst({
            where: { id: betId },
            include: {
              banca: {
                select: { usuarioId: true }
              }
            }
          });

          console.log('Aposta encontrada?', !!aposta);
          if (aposta) {
            console.log('Aposta ID:', aposta.id);
            console.log('Banca ID:', aposta.bancaId);
            console.log('Usuário da banca:', aposta.banca.usuarioId);
            console.log('Usuário atual:', user.id);
            console.log('Permissão OK?', aposta.banca.usuarioId === user.id);
          }

          if (!aposta || aposta.banca.usuarioId !== user.id) {
            console.error('ERRO: Aposta não encontrada ou sem permissão!');
            console.error('Aposta encontrada:', !!aposta);
            if (aposta) {
              console.error('Usuário da banca:', aposta.banca.usuarioId);
              console.error('Usuário atual:', user.id);
            }
            log.warn({ betId, userId: user.id, apostaFound: !!aposta }, 'Aposta não encontrada ou sem permissão');
            await answerCallbackQuery(callbackQuery.id, 'Aposta não encontrada ou você não tem permissão para excluí-la.', true);
            return;
          }
          
          console.log('✓ Permissão confirmada, processando exclusão...');

          // Excluir a aposta
          await prisma.bet.delete({
            where: { id: betId }
          });

          emitBetEvent({
            userId: user.id,
            type: 'deleted',
            payload: { betId }
          });

          // Atualizar a mensagem para indicar que foi excluída
          if (chatId && messageId) {
            const mensagemAtualizada = `✅ Bilhete excluído com sucesso.\n\n🆔 ID: ${betId}\n\nEsta aposta foi removida do sistema.`;
            await editMessageText(chatId, messageId, mensagemAtualizada, { inline_keyboard: [] });
          }

          await answerCallbackQuery(callbackQuery.id, 'Aposta excluída com sucesso!');
          log.info({ betId }, 'Aposta excluída com sucesso');
          return;
        } catch (error) {
          log.error({ error, betId: callbackData.replace('excluir_', '') }, 'Erro ao processar exclusão');
          await answerCallbackQuery(callbackQuery.id, 'Erro ao excluir aposta. Tente novamente.', true);
          return;
        }
      }

      // Processar edição de aposta
      if (callbackData.startsWith('editar_')) {
        try {
          const betId = callbackData.replace('editar_', '');
          console.log('=== PROCESSANDO EDIÇÃO ===');
          console.log('Bet ID extraído:', betId);
          console.log('User ID:', user.id);
          
          log.info({ 
            betId, 
            userId: user.id, 
            callbackDataOriginal: callbackData,
            betIdLength: betId.length,
            betIdIsEmpty: !betId || betId.length === 0
          }, 'Processando edição de aposta');
          
          if (!betId || betId.length === 0) {
            console.error('ERRO: BetId vazio!');
            log.error({ callbackData }, 'BetId vazio ao processar edição');
            await answerCallbackQuery(callbackQuery.id, 'Erro: ID da aposta não encontrado.', true);
            return;
          }

          // Verificar se a aposta pertence ao usuário
          console.log('=== BUSCANDO APOSTA NO BANCO (EDIÇÃO) ===');
          console.log('Buscando aposta com ID:', betId);
          console.log('User ID:', user.id);
          
          const aposta = await prisma.bet.findFirst({
            where: { id: betId },
            include: {
              banca: {
                select: { usuarioId: true }
              }
            }
          });

          console.log('Aposta encontrada?', !!aposta);
          if (aposta) {
            console.log('Aposta ID:', aposta.id);
            console.log('Banca ID:', aposta.bancaId);
            console.log('Usuário da banca:', aposta.banca.usuarioId);
            console.log('Usuário atual:', user.id);
            console.log('Permissão OK?', aposta.banca.usuarioId === user.id);
          }

          if (!aposta || aposta.banca.usuarioId !== user.id) {
            console.error('ERRO: Aposta não encontrada ou sem permissão para editar!');
            log.warn({ betId, userId: user.id, apostaFound: !!aposta }, 'Aposta não encontrada ou sem permissão para editar');
            await answerCallbackQuery(callbackQuery.id, 'Aposta não encontrada ou você não tem permissão para editá-la.', true);
            return;
          }
          
          console.log('✓ Permissão confirmada');
          
          // Abrir WebApp de edição com messageId e chatId
          const frontendUrl = process.env.FRONTEND_URL;
          const messageId = callbackQuery.message?.message_id;
          const chatId = callbackQuery.message?.chat?.id;
          
          if (frontendUrl && messageId && chatId) {
            const editUrl = `${frontendUrl}/telegram/edit?betId=${betId}&messageId=${messageId}&chatId=${chatId}`;
            
            await answerCallbackQuery(callbackQuery.id, '', false, editUrl);
            
            log.info({ betId, messageId, chatId }, 'Abrindo WebApp de edição com messageId e chatId');
            return;
          }
          
          // Fallback: Se não tiver frontendUrl ou messageId/chatId, informar o usuário
          await answerCallbackQuery(callbackQuery.id, 'Use o botão "Editar" que abre o modal automaticamente. Se não aparecer, verifique a configuração do FRONTEND_URL.', true);
          log.warn({ betId }, 'Callback de edição recebido, mas não foi possível abrir Web App');
          return;
        } catch (error) {
          log.error({ error, betId: callbackData.replace('editar_', '') }, 'Erro ao processar edição');
          await answerCallbackQuery(callbackQuery.id, 'Erro ao processar edição. Tente novamente.', true);
          return;
        }
      }

      // Processar alteração de status
      if (callbackData.startsWith('alterar_status_')) {
        try {
          const betId = callbackData.replace('alterar_status_', '');
          console.log('=== PROCESSANDO ALTERAÇÃO DE STATUS ===');
          console.log('Bet ID extraído:', betId);
          console.log('User ID:', user.id);
          
          log.info({ 
            betId, 
            userId: user.id, 
            callbackDataOriginal: callbackData,
            betIdLength: betId.length,
            betIdIsEmpty: !betId || betId.length === 0
          }, 'Processando alteração de status');
          
          if (!betId || betId.length === 0) {
            console.error('ERRO: BetId vazio!');
            log.error({ callbackData }, 'BetId vazio ao processar alteração de status');
            await answerCallbackQuery(callbackQuery.id, 'Erro: ID da aposta não encontrado.', true);
            return;
          }

          // Verificar se a aposta pertence ao usuário
          console.log('=== BUSCANDO APOSTA NO BANCO (STATUS) ===');
          console.log('Buscando aposta com ID:', betId);
          console.log('User ID:', user.id);
          
          const aposta = await prisma.bet.findFirst({
            where: { id: betId },
            include: {
              banca: {
                select: { usuarioId: true }
              }
            }
          });

          console.log('Aposta encontrada?', !!aposta);
          if (aposta) {
            console.log('Aposta ID:', aposta.id);
            console.log('Banca ID:', aposta.bancaId);
            console.log('Usuário da banca:', aposta.banca.usuarioId);
            console.log('Usuário atual:', user.id);
            console.log('Permissão OK?', aposta.banca.usuarioId === user.id);
          }

          if (!aposta || aposta.banca.usuarioId !== user.id) {
            console.error('ERRO: Aposta não encontrada ou sem permissão para alterar status!');
            log.warn({ betId, userId: user.id, apostaFound: !!aposta }, 'Aposta não encontrada ou sem permissão para alterar status');
            await answerCallbackQuery(callbackQuery.id, 'Aposta não encontrada ou você não tem permissão para alterar o status.', true);
            return;
          }
          
          console.log('✓ Permissão confirmada');
          
          // Se chegou aqui via callback, significa que o botão não tinha web_app
          // Isso não deveria acontecer se FRONTEND_URL estiver configurado
          // Mas vamos informar o usuário
          await answerCallbackQuery(callbackQuery.id, 'Use o botão "Alterar Status" que abre o modal automaticamente. Se não aparecer, verifique a configuração do FRONTEND_URL.', true);
          log.warn({ betId }, 'Callback de status recebido, mas deveria usar Web App');
          return;
        } catch (error) {
          log.error({ error, betId: callbackData.replace('alterar_status_', '') }, 'Erro ao processar alteração de status');
          await answerCallbackQuery(callbackQuery.id, 'Erro ao processar alteração de status. Tente novamente.', true);
          return;
        }
      }

      // Manter compatibilidade com o formato antigo (delete_bet_)
      if (callbackData.startsWith('delete_bet_')) {
        try {
          const betId = callbackData.replace('delete_bet_', '');
          log.info({ betId, userId: user.id }, 'Processando exclusão de aposta (formato antigo)');

          // Verificar se a aposta pertence ao usuário
          const aposta = await prisma.bet.findFirst({
            where: { id: betId },
            include: {
              banca: {
                select: { usuarioId: true }
              }
            }
          });

          if (!aposta || aposta.banca.usuarioId !== user.id) {
            await answerCallbackQuery(callbackQuery.id, 'Aposta não encontrada ou você não tem permissão para excluí-la.', true);
            return;
          }

          // Excluir a aposta
          await prisma.bet.delete({
            where: { id: betId }
          });

          emitBetEvent({
            userId: user.id,
            type: 'deleted',
            payload: { betId }
          });

          // Atualizar a mensagem para indicar que foi excluída
          if (chatId && messageId) {
            const mensagemAtualizada = `✅ Bilhete excluído com sucesso.\n\n🆔 ID: ${betId}\n\nEsta aposta foi removida do sistema.`;
            await editMessageText(chatId, messageId, mensagemAtualizada, { inline_keyboard: [] });
          }

          await answerCallbackQuery(callbackQuery.id, 'Aposta excluída com sucesso!');
          return;
        } catch (error) {
          log.error({ error, betId: callbackData.replace('delete_bet_', '') }, 'Erro ao processar exclusão (formato antigo)');
          await answerCallbackQuery(callbackQuery.id, 'Erro ao excluir aposta. Tente novamente.', true);
          return;
        }
      }

      // Se nenhum handler corresponder, apenas responder ao callback
      log.warn({ callbackData }, 'Callback não reconhecido');
      await answerCallbackQuery(callbackQuery.id);
        } catch (error) {
          log.error({ error, callbackData }, 'Erro geral ao processar callback query');
          try {
            await answerCallbackQuery(callbackQuery.id, 'Erro ao processar ação. Tente novamente.', true);
          } catch (answerError) {
            log.error({ answerError }, 'Erro ao responder callback query');
          }
        }
      })();
      
      // Responder ao webhook imediatamente
      return res.json({ ok: true });
    }

    const message = update?.message || update?.channel_post;
    if (!message) {
      return res.json({ ok: true });
    }

    const telegramUserId = message.from?.id ? String(message.from.id) : null;
    if (!telegramUserId) {
      return res.json({ ok: true });
    }

    // Processar comando /start para vinculação automática
    if (message.text && message.text.startsWith('/start')) {
      const rawParam = extractCommandParam(message.text);

      // Verificar se é uma chamada de suporte
      if (rawParam && rawParam.startsWith('support_')) {
        const accountId = normalizeAccountId(rawParam.replace('support_', ''));

        if (!accountId) {
          await sendTelegramMessage(
            message.chat.id,
            '❌ ID inválido. Copie novamente o ID exibido no perfil e tente outra vez.'
          );
          return res.json({ ok: true });
        }
        
        // Verificar se a conta existe
        const account = await prisma.user.findUnique({
          where: { id: accountId }
        });

        if (!account) {
          await sendTelegramMessage(message.chat.id, '❌ Conta não encontrada. Verifique se o ID está correto.');
          return res.json({ ok: true });
        }

        // Extrair primeiro nome (apelido)
        const firstName = account.nomeCompleto.split(' ')[0] || account.nomeCompleto;

        // Verificar se o Telegram do usuário está vinculado à conta
        const user = await prisma.user.findFirst({
          where: {
            telegramId: telegramUserId,
            id: accountId
          }
        });

        if (user) {
          // Usuário vinculado - enviar mensagem de boas-vindas personalizada
          await sendTelegramMessage(message.chat.id, `Olá, ${firstName}! 👋\n\nBem-vindo ao suporte!\nComo posso ajudar?`);
        } else {
          // Usuário não vinculado - pedir para vincular
          await sendTelegramMessage(message.chat.id, `Olá, ${firstName}! 👋\n\nBem-vindo ao suporte!\nComo posso ajudar?\n\n⚠️ Para um atendimento mais personalizado, vincule sua conta do Telegram no perfil do sistema.`);
        }
        
        return res.json({ ok: true });
      }

      // Processamento normal do /start para vinculação
      const accountId = normalizeAccountId(rawParam);

      if (accountId) {
        // Verificar se a conta existe
        const account = await prisma.user.findUnique({
          where: { id: accountId }
        });

        if (!account) {
          await sendTelegramMessage(message.chat.id, '❌ Conta não encontrada. Verifique se o ID está correto.');
          return res.json({ ok: true });
        }

        // Verificar se o telegramId já está vinculado a outra conta
        const existingUser = await prisma.user.findFirst({
          where: {
            telegramId: telegramUserId,
            NOT: { id: accountId }
          }
        });

        if (existingUser) {
          await sendTelegramMessage(message.chat.id, '❌ Este Telegram já está vinculado a outra conta. Desvincule primeiro no perfil do sistema.');
          return res.json({ ok: true });
        }

        // Verificar se a conta já tem outro Telegram vinculado
        if (account.telegramId && account.telegramId !== telegramUserId) {
          await sendTelegramMessage(message.chat.id, '❌ Esta conta já está vinculada a outro Telegram. Desvincule primeiro no perfil do sistema.');
          return res.json({ ok: true });
        }

        // Fazer a vinculação
        const telegramUsername = message.from?.username || null;
        await prisma.user.update({
          where: { id: accountId },
          data: { 
            telegramId: telegramUserId,
            telegramUsername: telegramUsername
          }
        });

        await sendTelegramMessage(message.chat.id, `✅ Conta vinculada com sucesso!\n\nBem-vindo, ${account.nomeCompleto}!\n\nAgora você pode enviar bilhetes de apostas para este bot e eles serão registrados automaticamente no sistema.`);
        return res.json({ ok: true });
      } else {
        // Se não tem ID, verificar se já está vinculado
        const user = await prisma.user.findFirst({
          where: { telegramId: telegramUserId }
        });

        if (user) {
          await sendTelegramMessage(message.chat.id, `Olá, ${user.nomeCompleto}!\n\nSua conta já está vinculada. Você pode enviar bilhetes de apostas para este bot.`);
        } else {
          await sendTelegramMessage(message.chat.id, 'Olá! Para vincular sua conta, acesse o perfil no sistema e clique em "Conectar com Telegram".');
        }
        return res.json({ ok: true });
      }
    }

    // Processar comando /id para vinculação manual
    if (message.text && message.text.startsWith('/id')) {
      const rawAccountId = extractCommandParam(message.text);
      const accountId = normalizeAccountId(rawAccountId);

      if (!accountId) {
        await sendTelegramMessage(
          message.chat.id,
          '❌ Uso: /id <ID_DA_CONTA>\n\nExemplo: /id 268b85d8-dbe4-47d9-98cd-846cc17ab7dc'
        );
        return res.json({ ok: true });
      }

      // Verificar se a conta existe
      const account = await prisma.user.findUnique({
        where: { id: accountId }
      });

      if (!account) {
        await sendTelegramMessage(message.chat.id, '❌ Conta não encontrada. Verifique se o ID está correto.');
        return res.json({ ok: true });
      }

      // Verificar se o telegramId já está vinculado a outra conta
      const existingUser = await prisma.user.findFirst({
        where: {
          telegramId: telegramUserId,
          NOT: { id: accountId }
        }
      });

      if (existingUser) {
        await sendTelegramMessage(message.chat.id, '❌ Este Telegram já está vinculado a outra conta. Desvincule primeiro usando /desvincular ou no perfil do sistema.');
        return res.json({ ok: true });
      }

      // Verificar se a conta já tem outro Telegram vinculado
      if (account.telegramId && account.telegramId !== telegramUserId) {
        await sendTelegramMessage(message.chat.id, '❌ Esta conta já está vinculada a outro Telegram. Desvincule primeiro no perfil do sistema.');
        return res.json({ ok: true });
      }

      // Fazer a vinculação
      const telegramUsername = message.from?.username || null;
      await prisma.user.update({
        where: { id: accountId },
        data: { 
          telegramId: telegramUserId,
          telegramUsername: telegramUsername
        }
      });

      await sendTelegramMessage(message.chat.id, `✅ Conta vinculada com sucesso!\n\nBem-vindo, ${account.nomeCompleto}!\n\nAgora você pode enviar bilhetes de apostas para este bot e eles serão registrados automaticamente no sistema.`);
      return res.json({ ok: true });
    }

    // Processar comando /desvincular
    if (message.text && message.text.startsWith('/desvincular')) {
      // Verificar se o usuário está vinculado
      const user = await prisma.user.findFirst({
        where: { telegramId: telegramUserId }
      });

      if (!user) {
        await sendTelegramMessage(message.chat.id, '❌ Nenhuma conta está vinculada a este Telegram.');
        return res.json({ ok: true });
      }

      // Desvincular
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          telegramId: null,
          telegramUsername: null
        }
      });

      await sendTelegramMessage(message.chat.id, `✅ Conta desvinculada com sucesso!\n\nSua conta ${user.nomeCompleto} foi desvinculada deste Telegram.\n\nPara vincular novamente, use o comando /id <ID_DA_CONTA> ou acesse o perfil no sistema.`);
      return res.json({ ok: true });
    }

    // Verificar se o usuário está vinculado (para processar imagens/documentos)
    const user = await prisma.user.findFirst({
      where: { telegramId: telegramUserId },
      include: { bancas: true }
    });

    if (!user) {
      await sendTelegramMessage(message.chat.id, 'Não encontrei um usuário vinculado a este Telegram. Associe seu Telegram no perfil do sistema ou use o comando /start com seu ID da conta.');
      return res.json({ ok: true });
    }

    const bancaPadrao = user.bancas.find((b: Bankroll) => b.ePadrao) || user.bancas[0];
    if (!bancaPadrao) {
      await sendTelegramMessage(message.chat.id, 'Nenhuma banca ativa foi encontrada para sua conta.');
      return res.json({ ok: true });
    }

    let fileId: string | null = null;
    let mimeType = 'image/jpeg';

    if (message.photo?.length) {
      const photo = message.photo[message.photo.length - 1];
      fileId = photo.file_id;
    } else if (message.document && message.document.mime_type?.startsWith('image/')) {
      fileId = message.document.file_id;
      mimeType = message.document.mime_type;
    } else {
      return res.json({ ok: true });
    }

    if (!fileId) {
      return res.json({ ok: true });
    }

    // Enviar mensagem de "processando"
    const processingMessage = await sendTelegramMessage(
      message.chat.id, 
      '⏳ Processando bilhete...',
      undefined,
      message.message_id
    );
    
    let processingMessageId: number | null = null;
    if (processingMessage && processingMessage.result) {
      processingMessageId = processingMessage.result.message_id;
    }

    const { base64, filePath } = await downloadTelegramFile(fileId);
    if (!mimeType && filePath) {
      if (filePath.endsWith('.png')) mimeType = 'image/png';
      else if (filePath.endsWith('.webp')) mimeType = 'image/webp';
    }

    // Extrair casa de aposta e tipster do caption se estiver em formato simples (duas linhas)
    let casaDeApostaFromCaption = '';
    let tipsterFromCaption = '';
    if (message.caption) {
      const lines = message.caption.trim().split('\n').map((line: string) => line.trim()).filter((line: string) => line);
      if (lines.length >= 2) {
        // Se tiver 2 ou mais linhas, primeira é casa de aposta, segunda é tipster
        casaDeApostaFromCaption = lines[0];
        tipsterFromCaption = lines[1];
      } else if (lines.length === 1) {
        // Se tiver apenas uma linha, é a casa de aposta
        casaDeApostaFromCaption = lines[0];
      }
    }

    let normalizedData: NormalizedTicketData;
    try {
      // Não enviar caption como ocrText para permitir que o serviço execute o OCR completo
      normalizedData = await processTicketViaBilheteTracker(base64, mimeType);
    } catch (serviceError) {
      log.error({ error: serviceError }, 'Falha ao processar bilhete via serviço externo, tentando fallback local');

      try {
        normalizedData = await processTicket({
          base64Image: base64,
          mimeType,
          ocrText: message.caption || ''
        });
      } catch (processingError) {
        log.error({ error: processingError }, 'Falha ao processar bilhete via IA');

        if (processingMessageId) {
          try {
            await deleteMessage(message.chat.id, processingMessageId);
          } catch (deleteProcessingError) {
            log.error({ deleteProcessingError }, 'Erro ao remover mensagem de processamento após falha no OCR');
          }
        }

        await sendTelegramMessage(
          message.chat.id,
          '❌ Não conseguimos interpretar este bilhete no momento. Verifique se o bot está com a IA configurada e tente reenviar em alguns minutos.',
          undefined,
          message.message_id
        );

        return res.json({ ok: true });
      }
    }

    // Priorizar valores do caption se disponíveis, senão usar os extraídos pela IA
    const casaDeAposta = casaDeApostaFromCaption || normalizedData.casaDeAposta || 'N/D';
    const tipster = tipsterFromCaption || normalizedData.tipster || '';

    const esporte = normalizedData.esporte || 'Outros';
    const jogo = normalizedData.jogo || message.caption || 'Aposta importada pelo Telegram';
    const dataJogo = normalizedData.dataJogo ? new Date(normalizedData.dataJogo) : new Date();

    console.log('=== CRIANDO APOSTA NO BANCO ===');
    console.log('Banca ID:', bancaPadrao.id);
    console.log('User ID:', user.id);
    
    const novaAposta = await prisma.bet.create({
      data: {
        bancaId: bancaPadrao.id,
        esporte,
        jogo,
        torneio: normalizedData.torneio || null,
        pais: normalizedData.pais || null,
        mercado: normalizedData.mercado || 'N/D',
        tipoAposta: normalizedData.tipoAposta || 'Simples',
        valorApostado: normalizedData.valorApostado || 0,
        odd: normalizedData.odd || 1,
        bonus: 0,
        dataJogo,
        tipster: tipster || null,
        status: normalizedData.status || 'Pendente',
        casaDeAposta: casaDeAposta,
        retornoObtido: normalizedData.status === 'Ganha'
          ? (normalizedData.valorApostado || 0) * (normalizedData.odd || 1)
          : null
      }
    });

    console.log('=== APOSTA CRIADA COM SUCESSO ===');
    console.log('Aposta ID gerado:', novaAposta.id);
    console.log('Aposta completa:', JSON.stringify(novaAposta, null, 2));

    emitBetEvent({
      userId: user.id,
      type: 'created',
      payload: { betId: novaAposta.id, source: 'telegram' }
    });

    // Buscar a aposta completa com todos os dados
    const apostaCompleta = await prisma.bet.findUnique({
      where: { id: novaAposta.id }
    });

    console.log('=== VERIFICANDO APOSTA NO BANCO ===');
    console.log('Aposta encontrada?', !!apostaCompleta);
    if (apostaCompleta) {
      console.log('ID da aposta encontrada:', apostaCompleta.id);
      console.log('Banca ID da aposta:', apostaCompleta.bancaId);
    } else {
      console.error('ERRO: Aposta não encontrada após criação!');
    }

    log.info({ 
      betId: novaAposta.id,
      apostaCompletaFound: !!apostaCompleta,
      processingMessageId
    }, 'Aposta criada, preparando para enviar mensagem de resposta');

    // Enviar mensagem formatada com os dados da aposta
    let mensagemEnviadaComSucesso = false;
    try {
      if (apostaCompleta) {
        let keyboard: any;
        try {
          keyboard = createBetInlineKeyboard(apostaCompleta.id);
          console.log('✅ Keyboard criado com sucesso');
          console.log('Keyboard type:', typeof keyboard);
          console.log('Keyboard tem inline_keyboard?', !!keyboard?.inline_keyboard);
          console.log('Keyboard inline_keyboard é array?', Array.isArray(keyboard?.inline_keyboard));
          console.log('Número de linhas:', keyboard?.inline_keyboard?.length);
        } catch (keyboardError) {
          console.error('ERRO ao criar keyboard:', keyboardError);
          log.error({ error: keyboardError, betId: apostaCompleta.id }, 'Erro ao criar keyboard');
          // Criar keyboard de fallback em caso de erro
          keyboard = {
            inline_keyboard: [
              [
                { text: '✏️ Editar', callback_data: `editar_${apostaCompleta.id}` },
                { text: '🗑️ Excluir', callback_data: `excluir_${apostaCompleta.id}` }
              ],
              [
                { text: '📚 Alterar Status', callback_data: `alterar_status_${apostaCompleta.id}` }
              ]
            ]
          };
          console.log('Usando keyboard de fallback após erro:', JSON.stringify(keyboard, null, 2));
        }
        
        // Validar se o keyboard foi criado corretamente
        if (!keyboard || !keyboard.inline_keyboard || !Array.isArray(keyboard.inline_keyboard) || keyboard.inline_keyboard.length === 0) {
          console.error('ERRO: Keyboard vazio ou inválido após criação!');
          console.error('Keyboard recebido:', JSON.stringify(keyboard, null, 2));
          log.error({ betId: apostaCompleta.id, keyboard }, 'Keyboard vazio ou inválido ao criar botões');
          // Criar keyboard de fallback
          keyboard = {
            inline_keyboard: [
              [
                { text: '✏️ Editar', callback_data: `editar_${apostaCompleta.id}` },
                { text: '🗑️ Excluir', callback_data: `excluir_${apostaCompleta.id}` }
              ],
              [
                { text: '📚 Alterar Status', callback_data: `alterar_status_${apostaCompleta.id}` }
              ]
            ]
          };
          console.log('Usando keyboard de fallback após validação:', JSON.stringify(keyboard, null, 2));
        }
        
        // Validação final antes de enviar
        console.log('=== VALIDAÇÃO FINAL DO KEYBOARD ===');
        console.log('Keyboard válido?', !!keyboard && !!keyboard.inline_keyboard && Array.isArray(keyboard.inline_keyboard) && keyboard.inline_keyboard.length > 0);
        console.log('Keyboard completo:', JSON.stringify(keyboard, null, 2));
        
        // Tentar formatar a mensagem completa
        let mensagemFormatada: string;
        try {
          mensagemFormatada = formatBetMessage(apostaCompleta, bancaPadrao);
        } catch (formatError) {
          log.error(formatError, 'Erro ao formatar mensagem, usando mensagem simplificada');
          // Mensagem simplificada mas completa
          mensagemFormatada = `✅ Bilhete processado com sucesso!

🆔 ID: ${apostaCompleta.id}
💰 Banca: ${bancaPadrao.nome}
${apostaCompleta.status === 'Ganha' ? '✅' : apostaCompleta.status === 'Perdida' ? '❌' : '⏳'} Status: ${apostaCompleta.status || 'Pendente'}
💎 ${apostaCompleta.status === 'Ganha' && apostaCompleta.retornoObtido ? `Lucro: R$ ${(apostaCompleta.retornoObtido - (apostaCompleta.valorApostado || 0)).toFixed(2).replace('.', ',')}` : apostaCompleta.status === 'Perdida' ? `Prejuízo: R$ ${(apostaCompleta.valorApostado || 0).toFixed(2).replace('.', ',')}` : 'Sem lucro ou prejuízo.'}
🏀 Esporte: ${apostaCompleta.esporte || 'N/D'}
🏆 Torneio: ${apostaCompleta.torneio || 'N/D'}
⚔️ Evento: ${apostaCompleta.jogo || 'N/D'}
🎯 Aposta: ${apostaCompleta.jogo || 'N/D'}${apostaCompleta.mercado && apostaCompleta.mercado !== 'N/D' ? ` - ${apostaCompleta.mercado}` : ''}
💵 Valor Apostado: R$ ${(apostaCompleta.valorApostado || 0).toFixed(2).replace('.', ',')}
📊 Odd: ${apostaCompleta.odd || 1}
💚 Retorno Potencial: R$ ${((apostaCompleta.valorApostado || 0) * (apostaCompleta.odd || 1)).toFixed(2).replace('.', ',')}
📄 Tipo: ${apostaCompleta.tipoAposta || 'Simples'}
📅 Data: ${apostaCompleta.dataJogo ? new Date(apostaCompleta.dataJogo).toLocaleDateString('pt-BR') : 'N/D'}
🎁 Bônus: ${(apostaCompleta.bonus || 0) > 0 ? `R$ ${apostaCompleta.bonus.toFixed(2).replace('.', ',')}` : 'Não'}
🏠 Casa: ${apostaCompleta.casaDeAposta || 'N/D'}
👤 Tipster: ${apostaCompleta.tipster || 'N/D'}`;
        }
        
        // Verificar se a mensagem não excede o limite do Telegram (4096 caracteres)
        if (mensagemFormatada.length > 4096) {
          log.warn({ 
            messageLength: mensagemFormatada.length,
            betId: apostaCompleta.id 
          }, 'Mensagem muito longa para o Telegram, truncando...');
          mensagemFormatada = mensagemFormatada.substring(0, 4000) + '\n\n... (mensagem truncada)';
        }
        
        // Validação final antes de enviar
        console.log('=== PREPARANDO PARA ENVIAR MENSAGEM ===');
        console.log('Bet ID:', apostaCompleta.id);
        console.log('Chat ID:', message.chat.id);
        console.log('Keyboard será enviado?', !!keyboard);
        console.log('Keyboard completo:', JSON.stringify(keyboard, null, 2));
        console.log('Tamanho da mensagem:', mensagemFormatada.length);
        
        log.info({ 
          betId: apostaCompleta.id,
          chatId: message.chat.id,
          keyboard: JSON.stringify(keyboard),
          messageLength: mensagemFormatada.length,
          messagePreview: mensagemFormatada.substring(0, 100),
          keyboardValid: !!(keyboard && keyboard.inline_keyboard && Array.isArray(keyboard.inline_keyboard) && keyboard.inline_keyboard.length > 0)
        }, 'Enviando mensagem completa com botões inline');
        
        // Enviar mensagem com botões - SEMPRE com os botões e como resposta ao bilhete original
        log.info({ 
          betId: apostaCompleta.id,
          chatId: message.chat.id,
          originalMessageId: message.message_id
        }, 'Chamando sendTelegramMessage como resposta ao bilhete original...');
        
        let result = await sendTelegramMessage(message.chat.id, mensagemFormatada, keyboard, message.message_id);
        
        log.info({ 
          betId: apostaCompleta.id,
          resultOk: result?.ok,
          hasResult: !!result,
          messageId: result?.result?.message_id
        }, 'Resultado do envio da mensagem');
        
        if (!result || !result.ok) {
          log.error({ 
            betId: apostaCompleta.id,
            result,
            chatId: message.chat.id,
            errorDescription: result?.description,
            errorCode: result?.error_code,
            keyboard: JSON.stringify(keyboard)
          }, 'Falha ao enviar mensagem com botões, tentando novamente...');
          
          // Tentar novamente - pode ser um erro temporário
          await new Promise(resolve => setTimeout(resolve, 1000)); // Aguardar 1 segundo
          result = await sendTelegramMessage(message.chat.id, mensagemFormatada, keyboard, message.message_id);
          
          if (!result || !result.ok) {
            log.error({ 
              betId: apostaCompleta.id,
              result,
              chatId: message.chat.id
            }, 'Falha na segunda tentativa, tentando sem botões como último recurso...');
            
            // Última tentativa: enviar sem botões para garantir que a mensagem seja enviada, mas ainda como resposta
            const resultWithoutButtons = await sendTelegramMessage(message.chat.id, mensagemFormatada, undefined, message.message_id);
            if (!resultWithoutButtons || !resultWithoutButtons.ok) {
              log.error({ 
                betId: apostaCompleta.id,
                resultWithoutButtons
              }, 'Falha ao enviar mensagem mesmo sem botões');
            } else {
              log.info({ 
                betId: apostaCompleta.id,
                messageId: resultWithoutButtons.result?.message_id
              }, 'Mensagem enviada sem botões como último recurso');
              mensagemEnviadaComSucesso = true;
            }
          } else {
            log.info({ 
              betId: apostaCompleta.id,
              messageId: result.result?.message_id
            }, 'Mensagem enviada com sucesso na segunda tentativa');
            mensagemEnviadaComSucesso = true;
            
            // Atualizar a mensagem para incluir messageId e chatId nas URLs dos botões
            if (result.result?.message_id) {
              try {
                const updatedKeyboard = createBetInlineKeyboard(
                  apostaCompleta.id,
                  result.result.message_id,
                  message.chat.id
                );
                await editMessageText(
                  message.chat.id,
                  result.result.message_id,
                  mensagemFormatada,
                  updatedKeyboard
                );
                log.info({ 
                  betId: apostaCompleta.id,
                  messageId: result.result.message_id,
                  chatId: message.chat.id
                }, 'Mensagem atualizada com messageId e chatId nos botões (segunda tentativa)');
              } catch (error) {
                log.warn({ error, betId: apostaCompleta.id }, 'Erro ao atualizar mensagem com messageId e chatId, mas mensagem já foi enviada');
              }
            }
          }
        } else {
          log.info({ 
            betId: apostaCompleta.id,
            messageId: result.result?.message_id
          }, 'Mensagem enviada com sucesso');
          mensagemEnviadaComSucesso = true;
          
          // Atualizar a mensagem para incluir messageId e chatId nas URLs dos botões
          if (result.result?.message_id) {
            try {
              const updatedKeyboard = createBetInlineKeyboard(
                apostaCompleta.id,
                result.result.message_id,
                message.chat.id
              );
              await editMessageText(
                message.chat.id,
                result.result.message_id,
                mensagemFormatada,
                updatedKeyboard
              );
              log.info({ 
                betId: apostaCompleta.id,
                messageId: result.result.message_id,
                chatId: message.chat.id
              }, 'Mensagem atualizada com messageId e chatId nos botões');
            } catch (error) {
              log.warn({ error, betId: apostaCompleta.id }, 'Erro ao atualizar mensagem com messageId e chatId, mas mensagem já foi enviada');
            }
          }
        }
      } else {
        log.warn({ betId: novaAposta.id }, 'Aposta completa não encontrada após criação');
        const result = await sendTelegramMessage(message.chat.id, '✅ Aposta registrada com sucesso no sistema.', undefined, message.message_id);
        if (result && result.ok) {
          mensagemEnviadaComSucesso = true;
        }
      }
    } catch (messageError) {
      log.error(messageError, 'Erro ao tentar enviar mensagem de resposta no Telegram');
      // Tentar enviar mensagem de erro simples, mas ainda como resposta
      try {
        const result = await sendTelegramMessage(message.chat.id, `✅ Bilhete processado e registrado no sistema com sucesso!\n\n🆔 ID: ${novaAposta.id}`, undefined, message.message_id);
        if (result && result.ok) {
          mensagemEnviadaComSucesso = true;
        }
      } catch (fallbackError) {
        log.error(fallbackError, 'Falha ao enviar mensagem de fallback');
      }
    }

    // Deletar mensagem de "processando" APENAS se a mensagem final foi enviada com sucesso
    if (processingMessageId && mensagemEnviadaComSucesso) {
      log.info({ processingMessageId }, 'Deletando mensagem de processando após envio bem-sucedido');
      try {
        await deleteMessage(message.chat.id, processingMessageId);
      } catch (deleteError) {
        log.error(deleteError, 'Erro ao deletar mensagem de processando');
      }
    } else if (processingMessageId) {
      log.warn({ 
        processingMessageId,
        mensagemEnviadaComSucesso 
      }, 'Mantendo mensagem de processando pois a mensagem final não foi enviada');
    }

    res.json({ ok: true });
  } catch (error) {
    log.error(error, 'Erro no webhook do Telegram');
    res.status(500).json({ ok: false });
  }
});

// POST /api/telegram/update-bet-message/:betId - Atualizar mensagem do Telegram quando uma aposta é editada
router.post('/update-bet-message/:betId', betUpdateRateLimiter, async (req, res) => {
  try {
    const { betId } = req.params;
    const { messageId, chatId } = req.body;
    
    // Buscar a aposta com todos os dados necessários
    const aposta = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        banca: {
          include: {
            usuario: {
              select: {
                telegramId: true
              }
            }
          }
        }
      }
    });

    if (!aposta) {
      return res.status(404).json({ error: 'Aposta não encontrada' });
    }

    const telegramId = aposta.banca.usuario.telegramId;
    if (!telegramId) {
      return res.status(200).json({ message: 'Usuário não tem Telegram vinculado' });
    }

    // Formatar a mensagem atualizada
    const mensagemAtualizada = formatBetMessage(aposta, aposta.banca);
    
    // Incluir messageId e chatId no keyboard se disponíveis
    let keyboard;
    if (messageId && chatId) {
      const chatIdNum = typeof chatId === 'string' ? Number.parseInt(chatId) : chatId;
      const messageIdNum = typeof messageId === 'string' ? Number.parseInt(messageId) : messageId;
      keyboard = createBetInlineKeyboard(aposta.id, messageIdNum, chatIdNum);
    } else {
      keyboard = createBetInlineKeyboard(aposta.id);
    }

    // Verificar se a mensagem não excede o limite do Telegram (4096 caracteres)
    let mensagemFinal = mensagemAtualizada;
    if (mensagemAtualizada.length > 4096) {
      log.warn({ 
        messageLength: mensagemAtualizada.length,
        betId: aposta.id 
      }, 'Mensagem muito longa para o Telegram, truncando...');
      mensagemFinal = mensagemAtualizada.substring(0, 4000) + '\n\n... (mensagem truncada)';
    }

    // Se messageId e chatId foram fornecidos, atualizar a mensagem
    if (messageId && chatId) {
      const chatIdNum = typeof chatId === 'string' ? Number.parseInt(chatId) : chatId;
      const messageIdNum = typeof messageId === 'string' ? Number.parseInt(messageId) : messageId;
      
      await editMessageText(chatIdNum, messageIdNum, mensagemFinal, keyboard);
      
      log.info({ 
        betId: aposta.id,
        chatId: chatIdNum,
        messageId: messageIdNum
      }, 'Mensagem do Telegram atualizada com sucesso');

      return res.json({ 
        success: true,
        message: 'Mensagem do Telegram atualizada com sucesso'
      });
    }

    // Se não tiver messageId e chatId, apenas retornar a mensagem formatada
    res.json({ 
      message: 'Mensagem formatada, mas messageId e chatId não foram fornecidos',
      formattedMessage: mensagemFinal.substring(0, 200) + '...',
      note: 'Para atualizar a mensagem no Telegram, forneça messageId e chatId no body da requisição'
    });
  } catch (error) {
    log.error(error, 'Erro ao atualizar mensagem do Telegram');
    res.status(500).json({ error: 'Erro ao atualizar mensagem' });
  }
});

// Webhook separado para o bot de suporte
router.post('/webhook-support', async (req, res) => {
  try {
    // Verificar secret token se configurado
    if (process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET) {
      const secret = req.headers['x-telegram-bot-api-secret-token'] || 
                     req.headers['X-Telegram-Bot-Api-Secret-Token'];
      
      if (!secret || (typeof secret !== 'string' || secret !== process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET)) {
        log.warn({ hasSecret: !!secret }, 'Webhook de suporte chamado com secret token inválido');
        return res.status(403).json({ error: 'Secret token inválido' });
      }
    }

    const update = req.body;
    
    console.log('=== WEBHOOK DE SUPORTE RECEBIDO ===');
    console.log('Tipo:', update.callback_query ? 'CALLBACK_QUERY' : update.message ? 'MESSAGE' : 'UNKNOWN');
    console.log('Body completo:', JSON.stringify(update, null, 2));
    
    log.info({
      hasCallbackQuery: !!update.callback_query,
      hasMessage: !!update.message,
      updateType: update.callback_query ? 'callback_query' : update.message ? 'message' : 'unknown'
    }, 'Webhook de suporte recebido');

    // Responder imediatamente ao Telegram
    res.json({ ok: true });

    // Processar mensagens
    if (update.message) {
      const message = update.message;
      const telegramUserId = String(message.from?.id);
      
      if (!telegramUserId) {
        log.warn({ message: 'Sem telegramUserId' }, 'Mensagem de suporte sem userId');
        return;
      }

      // Processar comando /start para suporte
      if (message.text && message.text.startsWith('/start')) {
        const parts = message.text.split(' ');
        const param = parts.length > 1 ? parts[1] : null;

        // Verificar se é uma chamada de suporte
        if (param && param.startsWith('support_')) {
          const accountId = param.replace('support_', '');
          
          // Verificar se a conta existe
          const account = await prisma.user.findUnique({
            where: { id: accountId }
          });

          if (!account) {
            await sendTelegramMessage(message.chat.id, '❌ Conta não encontrada.', true);
            return;
          }

          // Extrair primeiro nome (apelido)
          const firstName = account.nomeCompleto.split(' ')[0] || account.nomeCompleto;

          // Verificar se o Telegram do usuário está vinculado à conta
          const user = await prisma.user.findFirst({
            where: {
              telegramId: telegramUserId,
              id: accountId
            }
          });

          if (user) {
            // Usuário vinculado - enviar mensagem de boas-vindas personalizada
            await sendTelegramMessage(message.chat.id, `Olá, ${firstName}! 👋\n\nBem-vindo ao suporte!\nComo posso ajudar?`, undefined, undefined, true);
          } else {
            // Usuário não vinculado - pedir para vincular
            await sendTelegramMessage(message.chat.id, `Olá, ${firstName}! 👋\n\nBem-vindo ao suporte!\nComo posso ajudar?\n\n⚠️ Para um atendimento mais personalizado, vincule sua conta do Telegram no perfil do sistema.`, undefined, undefined, true);
          }
          
          return;
        }
      }

      // Se não for comando /start support_, apenas enviar mensagem genérica
      if (message.text && message.text.startsWith('/start')) {
        await sendTelegramMessage(message.chat.id, 'Olá! 👋\n\nBem-vindo ao suporte!\nComo posso ajudar?', undefined, undefined, true);
        return;
      }

      // Para outras mensagens, apenas logar (pode ser expandido para processar mensagens de suporte)
      log.info({ 
        chatId: message.chat.id, 
        text: message.text?.substring(0, 100) 
      }, 'Mensagem recebida no bot de suporte');
    }
  } catch (error) {
    log.error(error, 'Erro no webhook de suporte do Telegram');
    // Já respondemos ao Telegram, então apenas logar o erro
  }
});

export default router;

