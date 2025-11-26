import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

dotenv.config();

const USERS = Number(process.env.LOAD_TEST_USERS ?? 100);
const BETS_PER_USER = Number(process.env.LOAD_TEST_BETS ?? 3);
const API_BASE = (process.env.LOAD_TEST_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}/api`).replace(/\/$/, '');
// Número de usuários reais a criar
// Para evitar exceder limite de 10 apostas/dia do plano Gratuito, cada usuário deve criar apenas BETS_PER_USER apostas
// Então precisamos de pelo menos USERS usuários reais (um para cada sessão simulada)
const REAL_USERS = USERS; // Criar um usuário real para cada sessão simulada

type TestUser = {
  id: string;
  bancaId: string;
  token: string;
  email: string;
};

type ScenarioResult = {
  success: boolean;
  durationMs: number;
  requests: number;
  error?: string;
};

const sports = ['Futebol', 'Basquete', 'Tênis', 'CS:GO', 'Valorant', 'MMA', 'Vôlei'];
const tournaments = ['Champions League', 'Libertadores', 'NBA', 'CBLOL', 'Premier League', 'Serie A', 'MLS'];
const countries = ['Brasil', 'Espanha', 'Alemanha', 'Estados Unidos', 'Reino Unido', 'França', 'Itália'];
const markets = ['Over 2.5', 'Handicap -1.5', 'Moneyline', 'Ambas Marcam', 'Dupla Chance', 'Empate Anula'];
const betTypes = ['Simples', 'Combinada', 'Handicap', 'Props', 'Linha de Gols'];
const houses = ['Bet365', 'Pinnacle', 'Betano', '1xBet', 'Blaze', 'Sportingbet', 'Stake'];
const tipsters = ['ComandoPro', 'BetGuru', 'SharpMind', 'TraderX', 'MoneyMaker'];

const batchId = Date.now();

const randomOf = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const randomAmount = (min: number, max: number, decimals = 2) => {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(decimals));
};

const buildBetPayload = (bancaId: string) => {
  const status = randomOf(['Pendente', 'Pendente', 'Pendente', 'Ganha', 'Perdida', 'Void']);
  const payload: Record<string, unknown> = {
    bancaId,
    esporte: randomOf(sports),
    jogo: `${randomOf(countries)} ${randomOf(['FC', 'SC', 'AC'])} vs ${randomOf(countries)} ${randomOf(['FC', 'SC', 'AC'])}`,
    torneio: randomOf(tournaments),
    pais: randomOf(countries),
    mercado: randomOf(markets),
    tipoAposta: randomOf(betTypes),
    valorApostado: randomAmount(20, 150),
    odd: randomAmount(1.2, 4, 2),
    bonus: 0,
    dataJogo: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    tipster: randomOf(tipsters),
    status,
    casaDeAposta: randomOf(houses)
  };

  if (status !== 'Pendente') {
    payload.retornoObtido = randomAmount(0, 500);
  }

  return payload;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const seedUsers = async (): Promise<TestUser[]> => {
  const users: TestUser[] = [];

  for (let i = 0; i < REAL_USERS; i++) {
    const email = `loadtest-${batchId}-${i}@test.com`;
    const password = 'LoadTest123!';

    try {
      // Adicionar delay entre registros para evitar rate limiting (500ms entre cada)
      if (i > 0) {
        await delay(500);
      }

      // Registrar usuário
      const registerResponse = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeCompleto: `Load Test User ${batchId}-${i}`,
          email,
          senha: password
        })
      });

      if (!registerResponse.ok) {
        // Se for rate limit, apenas pular este usuário e continuar
        if (registerResponse.status === 429) {
          const errorText = await registerResponse.text();
          console.log(`[RATE LIMIT] Usuário ${i + 1} bloqueado pelo rate limiting. Continuando...`);
          continue; // Pula este usuário e tenta o próximo
        }
        const errorText = await registerResponse.text();
        throw new Error(`Registro falhou: ${registerResponse.status} - ${errorText}`);
      }

      // Fazer login para obter token
      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password })
      });

      if (!loginResponse.ok) {
        const errorText = await loginResponse.text();
        throw new Error(`Login falhou: ${loginResponse.status} - ${errorText}`);
      }

      const loginData = (await loginResponse.json()) as { token: string; user: { id: string } };
      const token = loginData.token;
      const userId = loginData.user.id;

      // Obter bancas do usuário
      const bancasResponse = await fetch(`${API_BASE}/bancas`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (!bancasResponse.ok) {
        throw new Error(`GET /bancas falhou: ${bancasResponse.status}`);
      }

      const bancas = (await bancasResponse.json()) as Array<{ id: string }>;
      const bancaId = bancas[0]?.id;

      if (!bancaId) {
        throw new Error('Nenhuma banca encontrada após registro');
      }

      users.push({
        id: userId,
        bancaId,
        token,
        email
      });

      if ((i + 1) % 5 === 0 || i === REAL_USERS - 1) {
        console.log(`[SETUP] ${i + 1}/${REAL_USERS} usuários preparados`);
      }
    } catch (error) {
      console.error(`[ERRO] Falha ao criar usuário ${i + 1}:`, error instanceof Error ? error.message : String(error));
      // Continua tentando criar os outros usuários
    }
  }

  return users;
};

const runScenario = async (user: TestUser): Promise<ScenarioResult> => {
  const start = performance.now();
  let requests = 0;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${user.token}`
  };

  try {
    const bancasResponse = await fetch(`${API_BASE}/bancas`, { headers });
    requests++;
    if (!bancasResponse.ok) {
      throw new Error(`GET /bancas falhou com status ${bancasResponse.status}`);
    }
    const bancas = (await bancasResponse.json()) as Array<{ id: string }>;
    const bancaId = bancas[0]?.id ?? user.bancaId;

    for (let i = 0; i < BETS_PER_USER; i++) {
      const payload = buildBetPayload(bancaId);
      const betResponse = await fetch(`${API_BASE}/apostas`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      requests++;

      if (!betResponse.ok) {
        const body = await betResponse.text();
        throw new Error(`POST /apostas falhou com status ${betResponse.status}: ${body}`);
      }
    }

    return {
      success: true,
      durationMs: performance.now() - start,
      requests
    };
  } catch (error) {
    return {
      success: false,
      durationMs: performance.now() - start,
      requests,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Nota: Não fazemos cleanup no ambiente público para não deletar dados reais

const summarize = (results: ScenarioResult[]) => {
  const total = results.length;
  const successes = results.filter((result) => result.success);
  const failures = results.filter((result) => !result.success);
  const totalRequests = results.reduce((sum, result) => sum + result.requests, 0);
  
  const durations = successes.map((r) => r.durationMs).sort((a, b) => a - b);
  const avgDuration = durations.length ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
  const minDuration = durations.length ? durations[0] : 0;
  const maxDuration = durations.length ? durations[durations.length - 1] : 0;
  const p50 = durations.length ? durations[Math.floor(durations.length * 0.5)] : 0;
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : 0;
  const p99 = durations.length ? durations[Math.floor(durations.length * 0.99)] : 0;

  console.log('\n=== Resultados do Teste de Carga ===');
  console.log(`Usuários simulados: ${total}`);
  console.log(`Sucesso: ${successes.length} (${((successes.length / total) * 100).toFixed(1)}%)`);
  console.log(`Falhas: ${failures.length} (${((failures.length / total) * 100).toFixed(1)}%)`);
  console.log(`Requisições totais: ${totalRequests}`);
  console.log(`\nTempos de resposta (ms):`);
  console.log(`  Média: ${avgDuration.toFixed(2)}`);
  console.log(`  Mínimo: ${minDuration.toFixed(2)}`);
  console.log(`  Máximo: ${maxDuration.toFixed(2)}`);
  console.log(`  P50 (mediana): ${p50.toFixed(2)}`);
  console.log(`  P95: ${p95.toFixed(2)}`);
  console.log(`  P99: ${p99.toFixed(2)}`);

  if (failures.length) {
    console.log('\nFalhas (primeiros 10 exemplos):');
    failures.slice(0, 10).forEach((failure, index) => {
      console.log(`  ${index + 1}. ${failure.error}`);
    });
  }
};

const main = async () => {
  const start = performance.now();
  let users: TestUser[] = [];

  try {
    console.log(`[INFO] Iniciando teste de carga: ${USERS} usuários simultâneos, ${BETS_PER_USER} apostas cada.`);
    console.log(`[INFO] Base URL: ${API_BASE}`);
    console.log(`[INFO] Criando ${REAL_USERS} usuários de teste...`);

    users = await seedUsers();

    if (users.length === 0) {
      console.error('[ERRO] Nenhum usuário foi criado. Não é possível executar o teste.');
      process.exitCode = 1;
      return;
    }

    console.log(`[INFO] ${users.length} usuários criados com sucesso.`);
    console.log(`[INFO] Iniciando ${users.length} sessões simultâneas (cada usuário cria ${BETS_PER_USER} apostas)...`);
    
    // Cada usuário executa seu próprio cenário (sem reutilização)
    const results = await Promise.all(users.map((user) => runScenario(user)));
    summarize(results);
  } catch (error) {
    console.error('[ERRO] Falha ao executar teste de carga:', error);
    process.exitCode = 1;
  } finally {
    console.log(`[INFO] Script finalizado em ${(performance.now() - start).toFixed(0)} ms.`);
    console.log(`[INFO] Nota: Usuários de teste foram criados no ambiente público e não foram removidos.`);
  }
};

await main();


