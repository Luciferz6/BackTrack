import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || 'https://beckend-planilha.onrender.com';
const WEBHOOK_URL = `${BACKEND_URL}/api/telegram/webhook`;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN não encontrado no .env');
  console.error('   Adicione TELEGRAM_BOT_TOKEN=seu_token_no_env');
  process.exit(1);
}

async function setWebhook() {
  try {
    console.log('🔧 Configurando webhook do Telegram...');
    console.log(`   URL: ${WEBHOOK_URL}`);
    if (WEBHOOK_SECRET) {
      console.log(`   Secret token: ${WEBHOOK_SECRET.substring(0, 8)}...`);
    }

    const body: any = {
      url: WEBHOOK_URL,
      // IMPORTANTE: Especificar quais tipos de updates queremos receber
      // Sem isso, o Telegram só envia 'message' por padrão e não envia 'callback_query'
      allowed_updates: ['message', 'callback_query', 'edited_message', 'channel_post']
    };

    if (WEBHOOK_SECRET) {
      body.secret_token = WEBHOOK_SECRET;
    }
    
    console.log('   Allowed updates:', body.allowed_updates.join(', '));

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json() as { ok: boolean; description?: string; result?: boolean };

    if (data.ok) {
      console.log('✅ Webhook configurado com sucesso!');
      if (data.result) {
        console.log(`   Webhook URL: ${data.result}`);
      }
    } else {
      console.error('❌ Erro ao configurar webhook:', data.description);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Erro ao configurar webhook:', error.message);
    process.exit(1);
  }
}

async function getWebhookInfo() {
  try {
    console.log('🔍 Verificando status do webhook...');
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const data = await response.json() as {
      ok: boolean;
      result?: {
        url?: string;
        has_custom_certificate?: boolean;
        pending_update_count?: number;
        last_error_date?: number;
        last_error_message?: string;
        max_connections?: number;
        allowed_updates?: string[];
      };
    };

    if (data.ok && data.result) {
      const info = data.result;
      console.log('📊 Status do Webhook:');
      console.log(`   URL: ${info.url || 'Não configurado'}`);
      console.log(`   Updates pendentes: ${info.pending_update_count || 0}`);
      if (info.allowed_updates && info.allowed_updates.length > 0) {
        console.log(`   ✅ Allowed updates: ${info.allowed_updates.join(', ')}`);
      } else {
        console.log(`   ⚠️  Allowed updates: Não especificado (padrão: apenas 'message')`);
        console.log(`   ⚠️  IMPORTANTE: Callbacks de botões não funcionarão sem 'callback_query'!`);
      }
      if (info.last_error_message) {
        console.log(`   ⚠️  Último erro: ${info.last_error_message}`);
        if (info.last_error_date) {
          const errorDate = new Date(info.last_error_date * 1000);
          console.log(`   Data do erro: ${errorDate.toLocaleString('pt-BR')}`);
        }
      } else {
        console.log('   ✅ Nenhum erro recente');
      }
    } else {
      console.error('❌ Erro ao obter informações do webhook');
    }
  } catch (error: any) {
    console.error('❌ Erro ao verificar webhook:', error.message);
  }
}

async function deleteWebhook() {
  try {
    console.log('🗑️  Removendo webhook...');
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drop_pending_updates: false })
    });

    const data = await response.json() as { ok: boolean; description?: string };

    if (data.ok) {
      console.log('✅ Webhook removido com sucesso!');
    } else {
      console.error('❌ Erro ao remover webhook:', data.description);
    }
  } catch (error: any) {
    console.error('❌ Erro ao remover webhook:', error.message);
  }
}

// Funções para o bot de suporte
const TELEGRAM_SUPPORT_BOT_TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN;
const SUPPORT_WEBHOOK_SECRET = process.env.TELEGRAM_SUPPORT_WEBHOOK_SECRET;
const SUPPORT_WEBHOOK_URL = `${BACKEND_URL}/api/telegram/webhook-support`;

async function setSupportWebhook() {
  if (!TELEGRAM_SUPPORT_BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_SUPPORT_BOT_TOKEN não encontrado. Pulando configuração do webhook de suporte.');
    return;
  }

  try {
    console.log('🔧 Configurando webhook do bot de suporte...');
    console.log(`   URL: ${SUPPORT_WEBHOOK_URL}`);
    if (SUPPORT_WEBHOOK_SECRET) {
      console.log(`   Secret token: ${SUPPORT_WEBHOOK_SECRET.substring(0, 8)}...`);
    }

    const body: any = {
      url: SUPPORT_WEBHOOK_URL,
      allowed_updates: ['message', 'callback_query', 'edited_message']
    };

    if (SUPPORT_WEBHOOK_SECRET) {
      body.secret_token = SUPPORT_WEBHOOK_SECRET;
    }
    
    console.log('   Allowed updates:', body.allowed_updates.join(', '));

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_SUPPORT_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json() as { ok: boolean; description?: string; result?: boolean };

    if (data.ok) {
      console.log('✅ Webhook de suporte configurado com sucesso!');
    } else {
      console.error('❌ Erro ao configurar webhook de suporte:', data.description);
    }
  } catch (error: any) {
    console.error('❌ Erro ao configurar webhook de suporte:', error.message);
  }
}

async function main() {
  const command = process.argv[2];
  const botType = process.argv[3]; // 'support' para bot de suporte

  if (botType === 'support') {
    // Comandos específicos para o bot de suporte
    switch (command) {
      case 'set':
      case 'setup':
        await setSupportWebhook();
        break;
      default:
        console.log('📖 Uso: npm run telegram:webhook <comando> support');
        console.log('');
        console.log('Comandos disponíveis para bot de suporte:');
        console.log('  set/setup   - Configurar o webhook do bot de suporte');
        console.log('');
        console.log('⚠️  Certifique-se de que:');
        console.log('  1. TELEGRAM_SUPPORT_BOT_TOKEN está configurado no .env');
        console.log('  2. BACKEND_URL está configurado (ou use o padrão)');
        process.exit(1);
    }
    return;
  }

  switch (command) {
    case 'set':
    case 'setup':
      await setWebhook();
      await getWebhookInfo();
      // Também configurar webhook de suporte se o token estiver disponível
      await setSupportWebhook();
      break;
    case 'info':
    case 'status':
      await getWebhookInfo();
      break;
    case 'delete':
    case 'remove':
      await deleteWebhook();
      break;
    default:
      console.log('📖 Uso: npm run telegram:webhook <comando> [support]');
      console.log('');
      console.log('Comandos disponíveis:');
      console.log('  set/setup   - Configurar o webhook (e webhook de suporte se configurado)');
      console.log('  info/status - Verificar status do webhook');
      console.log('  delete/remove - Remover o webhook');
      console.log('');
      console.log('Para configurar apenas o bot de suporte:');
      console.log('  npm run telegram:webhook set support');
      console.log('');
      console.log('Exemplos:');
      console.log('  npm run telegram:webhook set');
      console.log('  npm run telegram:webhook info');
      console.log('  npm run telegram:webhook delete');
      console.log('  npm run telegram:webhook set support');
      console.log('');
      console.log('⚠️  Certifique-se de que:');
      console.log('  1. TELEGRAM_BOT_TOKEN está configurado no .env');
      console.log('  2. BACKEND_URL está configurado (ou use o padrão)');
      console.log('  3. O backend está rodando e acessível em:', BACKEND_URL);
      console.log('  4. (Opcional) TELEGRAM_SUPPORT_BOT_TOKEN para bot de suporte separado');
      process.exit(1);
  }
}

main().catch(console.error);

