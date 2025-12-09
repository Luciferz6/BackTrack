import { prisma } from '../lib/prisma.js';
import { log } from './logger.js';

const FREE_PLAN_NAME = 'Gratuito';
let cachedFreePlanId: string | null = null;

const getFallbackPlanId = async (): Promise<string | null> => {
  if (cachedFreePlanId) {
    return cachedFreePlanId;
  }

  const plan = await prisma.plan.findUnique({ where: { nome: FREE_PLAN_NAME } });
  cachedFreePlanId = plan?.id ?? null;
  return cachedFreePlanId;
};

export const ensureActivePlan = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      planoId: true,
      promoOriginalPlanId: true,
      promoExpiresAt: true,
    }
  });

  if (!user || !user.promoExpiresAt) {
    return;
  }

  const now = new Date();
  if (user.promoExpiresAt > now) {
    return;
  }

  let fallbackPlanId = user.promoOriginalPlanId;
  if (!fallbackPlanId) {
    fallbackPlanId = await getFallbackPlanId();
  }

  if (!fallbackPlanId) {
    log.warn({ userId }, 'Não foi possível determinar plano fallback ao expirar promoção');
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      planoId: fallbackPlanId,
      promoOriginalPlanId: null,
      promoExpiresAt: null,
    }
  });

  log.info({ userId, fallbackPlanId }, 'Plano promocional expirado, revertendo para plano original');
};
