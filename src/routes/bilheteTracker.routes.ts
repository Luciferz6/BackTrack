import express from 'express';
import { z } from 'zod';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware.js';
import { handleRouteError } from '../utils/errorHandler.js';

// Importa o bilhete-tracker já compilado (dist).
// Caminho relativo a partir de dist/routes:
//   dist/routes -> ../../.. -> (raiz do workspace) -> bilhete-tracker/dist
// Certifique-se de rodar `npm install && npm run build` dentro de bilhete-tracker
// pelo menos uma vez antes de usar esta rota em produção.
import { processBilheteFromImageUrl } from '../../../bilhete-tracker/dist/index.js';

const router: express.Router = express.Router();

const processBilheteSchema = z.object({
  imageUrl: z.string().url('URL de imagem inválida'),
  useMockLlm: z.boolean().optional(),
});

// POST /api/bilhetes/process-image
// Body: { imageUrl: string, useMockLlm?: boolean }
// - Chama OCR.space (engine 2)
// - Roda o pipeline bilhete-tracker
// - Retorna o BilheteFinal padronizado
router.post('/process-image', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { imageUrl, useMockLlm } = processBilheteSchema.parse(req.body);

    const bilheteFinal = await processBilheteFromImageUrl(imageUrl, {
      useMockLlm,
    });

    return res.json(bilheteFinal);
  } catch (error) {
    return handleRouteError(error, res);
  }
});

export default router;
