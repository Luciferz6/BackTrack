import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import { log } from '../utils/logger.js';

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const TICKET_PROMPT = `Você é um agente de EXTRAÇÃO ESTRUTURADA DE DADOS capaz de analisar IMAGENS de bilhetes de apostas esportivas.  

Sua única função é produzir um JSON válido com informações claramente extraídas da imagem e, quando necessário, de pesquisas no Google.

Você possui acesso à internet e DEVE realizar pesquisas quando dados não estiverem visíveis.

====================================================================

 REGRAS OBRIGATÓRIAS E INFLEXÍVEIS

====================================================================

1) DATA DO JOGO (PESQUISA OBRIGATÓRIA SE NÃO ESTIVER NA IMAGEM)

- Se a data não estiver visível, você DEVE pesquisar no Google usando:

  "Time A vs Time B [esporte] data do jogo"

- PRIORIDADE ABSOLUTA:

  A) Jogos ocorrendo nos próximos 7 dias (SEMANA ATUAL)  

  B) Se não houver, procurar entre 8 e 14 dias (SEMANA SEGUINTE)

- Se houver múltiplas datas, selecione a mais próxima.

- Formato: **YYYY-MM-DD** (somente data, sem hora).

- Se não for possível identificar dentro de 14 dias → dataJogo = "".

2) TORNEIO / COMPETIÇÃO (PESQUISA OBRIGATÓRIA SE NÃO ESTIVER NA IMAGEM)

- Pesquise no Google com:

  "Time A vs Time B [esporte] campeonato / torneio"

- Escolha o torneio compatível com o jogo encontrado.

- Se não for possível identificar com segurança → torneio = "".

3) PROIBIÇÕES ABSOLUTAS

- NÃO produzir texto antes ou depois do JSON.

- NÃO inventar informações.

- NÃO alterar nomes dos times.

- NÃO criar campos extras.

- NÃO adicionar explicações, comentários, justificativas ou anotações.

4) FORMATO DE SAÍDA (OBRIGATÓRIO)

Você DEVE retornar EXATAMENTE este JSON:

{
  "casaDeAposta": "nome da casa",
  "esporte": "futebol/basquete/tênis/...",
  "jogo": "Time A vs Time B",
  "torneio": "nome do torneio ou ''",
  "pais": "país ou 'Mundo'",
  "mercado": "ex: Over 2.5, 1x2, Ambas Marcam",
  "tipoAposta": "Simples/Múltipla/Combinada",
  "valorApostado": número (somente número),
  "odd": número (somente número),
  "dataJogo": "YYYY-MM-DD ou ''",
  "status": "Pendente/Ganha/Perdida"
}

5) VALORES PADRÃO (USAR APENAS QUANDO NÃO FOR POSSÍVEL IDENTIFICAR)

- torneio = ""

- pais = "Mundo"

- tipoAposta = "Simples"

- status = "Pendente"

- dataJogo = ""

====================================================================

 FEW-SHOT: EXEMPLOS DE ENTRADA E SAÍDA

====================================================================

==========================

 EXEMPLO 1 — Data visível na imagem

==========================

[IMAGEM DO BILHETE]

• Casa: Betano  

• Esporte: Futebol  

• Jogo: Flamengo vs Botafogo  

• Torneio: Copa do Brasil  

• Mercado: Over 2.5  

• Valor: R$50  

• Odd: 1.90  

• Data visível no bilhete: 2025-03-10  

• Status: Pendente

SAÍDA CORRETA:

{
  "casaDeAposta": "Betano",
  "esporte": "futebol",
  "jogo": "Flamengo vs Botafogo",
  "torneio": "Copa do Brasil",
  "pais": "Mundo",
  "mercado": "Over 2.5",
  "tipoAposta": "Simples",
  "valorApostado": 50,
  "odd": 1.9,
  "dataJogo": "2025-03-10",
  "status": "Pendente"
}

==========================

 EXEMPLO 2 — Data NÃO visível (pesquisa obrigatória)

==========================

[IMAGEM DO BILHETE]

• Casa: Blaze  

• Esporte: Tênis  

• Jogo: Jannik Sinner vs Daniil Medvedev  

• Torneio: Não aparece  

• Mercado: Vitória Sinner  

• Valor: R$100  

• Odd: 1.65  

• Status: Pendente

PESQUISA REALIZADA:

"Jannik Sinner vs Daniil Medvedev tennis schedule"

→ Encontrado jogo para 2025-02-18 (semana atual)

→ Torneio encontrado: ATP Rotterdam

SAÍDA CORRETA:

{
  "casaDeAposta": "Blaze",
  "esporte": "tênis",
  "jogo": "Jannik Sinner vs Daniil Medvedev",
  "torneio": "ATP Rotterdam",
  "pais": "Mundo",
  "mercado": "Vitória Sinner",
  "tipoAposta": "Simples",
  "valorApostado": 100,
  "odd": 1.65,
  "dataJogo": "2025-02-18",
  "status": "Pendente"
}

==========================

 EXEMPLO 3 — Nada encontrado nas duas semanas

==========================

[IMAGEM DO BILHETE]

• Casa: PixBet  

• Esporte: Basquete  

• Jogo: Chicago Bulls vs LA Lakers  

• Data: Não aparece  

• Torneio: Não aparece

PESQUISA:

Nenhum jogo Bulls vs Lakers encontrado dentro de 14 dias.

SAÍDA CORRETA:

{
  "casaDeAposta": "PixBet",
  "esporte": "basquete",
  "jogo": "Chicago Bulls vs LA Lakers",
  "torneio": "",
  "pais": "Mundo",
  "mercado": "",
  "tipoAposta": "Simples",
  "valorApostado": 0,
  "odd": 0,
  "dataJogo": "",
  "status": "Pendente"
}

====================================================================

 INSTRUÇÃO FINAL

====================================================================

Depois de analisar a imagem do bilhete e realizar as pesquisas obrigatórias,  

RETORNE SOMENTE O JSON FINAL — sem comentários, sem texto adicional, sem explicações.`;

const buildTextPrompt = (text: string) => `${TICKET_PROMPT}

TEXTO DO BILHETE:
"""
${text}
"""
`;

const parseAiJson = (content: string) => {
  if (!content) {
    throw new Error('Resposta vazia do provedor de IA');
  }

  let jsonString = content.trim();
  jsonString = jsonString.replace(/```json\s*/gi, '').replace(/```/g, '');

  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : jsonString;

  return JSON.parse(candidate);
};

export type NormalizedTicketData = {
  casaDeAposta: string;
  tipster: string;
  esporte: string;
  jogo: string;
  torneio: string;
  pais: string;
  mercado: string;
  tipoAposta: string;
  valorApostado: number;
  odd: number;
  dataJogo: string;
  status: string;
};

const normalizeExtractedData = (extractedData: any): NormalizedTicketData => ({
  casaDeAposta: extractedData.casaDeAposta || '',
  tipster: extractedData.tipster || '',
  esporte: extractedData.esporte || '',
  jogo: extractedData.jogo || '',
  torneio: extractedData.torneio || '',
  pais: extractedData.pais || 'Mundo',
  mercado: extractedData.mercado || '',
  tipoAposta: extractedData.tipoAposta || 'Simples',
  valorApostado:
    typeof extractedData.valorApostado === 'number'
      ? extractedData.valorApostado
      : parseFloat(
          String(extractedData.valorApostado || '0')
            .replace(/[^\d.,]/g, '')
            .replace(',', '.')
        ) || 0,
  odd:
    typeof extractedData.odd === 'number'
      ? extractedData.odd
      : parseFloat(
          String(extractedData.odd || '0')
            .replace(/[^\d.,]/g, '')
            .replace(',', '.')
        ) || 0,
  dataJogo: extractedData.dataJogo ? String(extractedData.dataJogo).split('T')[0] : '',
  status: extractedData.status || 'Pendente'
});

const buildImagePrompt = (ocrText?: string) => {
  if (ocrText?.trim()) {
    return `${TICKET_PROMPT}

TEXTO DO COMENTÁRIO/LEGENDA DA IMAGEM (use como referência adicional):
"""
${ocrText.trim()}
"""

NOTA: O comentário/legenda pode conter informações adicionais que não estão visíveis na imagem. Use essas informações para complementar a extração de dados quando relevante.`;
  }
  return TICKET_PROMPT;
};

const processWithGemini = async (base64Image: string, mimeType: string, ocrText?: string) => {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY não configurada');
  }

  if (ocrText?.trim()) {
    log.debug('[Gemini] Enviando imagem para análise com caption/legenda');
  } else {
    log.debug('[Gemini] Enviando imagem para análise');
  }
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const imagePart = {
    inlineData: {
      data: base64Image,
      mimeType
    }
  };

  const prompt = buildImagePrompt(ocrText);
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const content = response.text();

  const extractedData = parseAiJson(content);
  return normalizeExtractedData(extractedData);
};

const processWithDeepseek = async (base64Image: string, mimeType: string, ocrText?: string) => {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY não configurada');
  }

  const prompt = buildImagePrompt(ocrText);
  
  // Preparar conteúdo: imagem + texto
  const content: any[] = [
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`
      }
    },
    {
      type: 'text',
      text: prompt
    }
  ];

  if (ocrText?.trim()) {
    log.debug('[DeepSeek] Enviando imagem para análise com caption/legenda');
  } else {
    log.debug('[DeepSeek] Enviando imagem para análise');
  }

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-multimodal',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errorBody}`);
  }

  const payload: any = await response.json();
  const messageContent = payload?.choices?.[0]?.message?.content;

  let content_text = '';
  if (typeof messageContent === 'string') {
    content_text = messageContent;
  } else if (Array.isArray(messageContent)) {
    content_text = messageContent.map((part: any) => part?.text || part?.content || '').join('\n').trim();
  } else if (messageContent?.content) {
    content_text = String(messageContent.content);
  }

  if (!content_text) {
    throw new Error('Resposta vazia da API DeepSeek');
  }

  const extractedData = parseAiJson(content_text);
  return normalizeExtractedData(extractedData);
};

export const processTicket = async ({
  base64Image,
  mimeType,
  ocrText
}: {
  base64Image: string;
  mimeType: string;
  ocrText?: string;
}): Promise<NormalizedTicketData> => {
  const attempts: Array<{ name: 'gemini' | 'deepseek'; handler: () => Promise<NormalizedTicketData> }> = [];

  // Priorizar DeepSeek se configurado (pode ser mais barato ou mais rápido)
  if (process.env.DEEPSEEK_API_KEY) {
    attempts.push({
      name: 'deepseek',
      handler: () => processWithDeepseek(base64Image, mimeType, ocrText)
    });
  }

  // Gemini como fallback ou alternativa
  if (genAI) {
    attempts.push({
      name: 'gemini',
      handler: () => processWithGemini(base64Image, mimeType, ocrText)
    });
  }

  if (attempts.length === 0) {
    throw new Error('Nenhum provedor de IA configurado');
  }

  for (const attempt of attempts) {
    try {
      return await attempt.handler();
    } catch (error) {
      log.error(error, `[${attempt.name}] Falha ao processar bilhete`);
    }
  }

  throw new Error('Não foi possível processar o bilhete com os provedores disponíveis.');
};

