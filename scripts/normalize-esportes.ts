import { prisma } from './prisma-helper.js';
import { normalizarEsporteParaOpcao } from '../src/utils/esportes.js';

const BATCH_SIZE = 200;
const FALLBACK_ESPORTE = 'Outros Esportes';

const normalizeEsporteValue = (value?: string | null): string => {
  const trimmed = (value || '').trim();
  const normalized = normalizarEsporteParaOpcao(trimmed);
  const finalValue = normalized || trimmed;
  const ensured = finalValue || FALLBACK_ESPORTE;
  // Garantir que o emoji esteja presente
  const withEmoji = normalizarEsporteParaOpcao(ensured) || ensured;
  return withEmoji || FALLBACK_ESPORTE;
};

async function normalizeEsportes() {
  console.log('🔄 Iniciando normalização de esportes...');

  let processed = 0;
  let updated = 0;
  let lastId: string | null = null;

  while (true) {
    const bets: Array<{ id: string; esporte: string | null }> = await prisma.bet.findMany({
      select: { id: true, esporte: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(lastId ? { skip: 1, cursor: { id: lastId } } : {})
    });

    if (bets.length === 0) {
      break;
    }

    for (const bet of bets) {
      processed += 1;
      const normalized = normalizeEsporteValue(bet.esporte);
      const current = (bet.esporte || '').trim();

      if (normalized === current || (!current && normalized === FALLBACK_ESPORTE && !bet.esporte)) {
        continue;
      }

      await prisma.bet.update({
        where: { id: bet.id },
        data: { esporte: normalized }
      });

      updated += 1;
    }

    lastId = bets[bets.length - 1].id;
    console.log(`➡️ Processadas: ${processed} | Atualizadas: ${updated}`);
  }

  console.log('✅ Normalização concluída!');
  console.log(`📊 Total processado: ${processed}`);
  console.log(`🆙 Total atualizado: ${updated}`);
}

normalizeEsportes()
  .then(() => {
    console.log('🎉 Finalizado sem erros.');
  })
  .catch((error) => {
    console.error('❌ Erro ao normalizar esportes:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
