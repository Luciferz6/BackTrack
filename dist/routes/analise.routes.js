import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { calcularResultadoAposta, isApostaConcluida, isApostaGanha } from '../utils/betCalculations.js';
import { buildBetWhere } from '../utils/buildBetWhere.js';
import { handleRouteError } from '../utils/errorHandler.js';
const router = express.Router();
// GET /api/analise/dashboard - Calcular métricas do dashboard
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bancaId, dataInicio, dataFim, tipster, casa, esporte, status, oddMin, oddMax, evento } = req.query;
        const bancas = await prisma.bankroll.findMany({
            where: {
                usuarioId: userId,
                ...(bancaId && typeof bancaId === 'string' ? { id: bancaId } : {})
            },
            select: { id: true }
        });
        const bancaIds = bancas.map(b => b.id);
        if (bancaIds.length === 0) {
            return res.json({
                metricas: {
                    roi: 0,
                    taxaAcerto: 0,
                    lucroTotal: 0,
                    totalInvestido: 0,
                    totalDepositado: 0,
                    totalSacado: 0,
                    saldoBanca: 0
                },
                lucroDiario: [],
                lucroAcumulado: [],
                lucroPorTipster: [],
                resumoPorEsporte: [],
                resumoPorCasa: []
            });
        }
        const where = buildBetWhere({
            bancaIds,
            dataInicio: typeof dataInicio === 'string' ? dataInicio : undefined,
            dataFim: typeof dataFim === 'string' ? dataFim : undefined,
            tipster: typeof tipster === 'string' ? tipster : undefined,
            casa: typeof casa === 'string' ? casa : undefined,
            esporte: typeof esporte === 'string' ? esporte : undefined,
            status: typeof status === 'string' ? status : undefined,
            oddMin: typeof oddMin === 'string' ? oddMin : undefined,
            oddMax: typeof oddMax === 'string' ? oddMax : undefined,
            evento: typeof evento === 'string' ? evento : undefined
        });
        const apostas = await prisma.bet.findMany({
            where,
            orderBy: { dataJogo: 'asc' }
        });
        const transacoes = await prisma.financialTransaction.findMany({
            where: { bancaId: { in: bancaIds } }
        });
        // I. MÉTRICAS FINANCEIRAS
        // 1. Total Depositado
        const totalDepositado = transacoes
            .filter(t => t.tipo === 'Depósito')
            .reduce((sum, t) => sum + t.valor, 0);
        // 2. Total Sacado
        const totalSacado = transacoes
            .filter(t => t.tipo === 'Saque')
            .reduce((sum, t) => sum + t.valor, 0);
        // 3. Total Investido (Stake Total) - TODAS as apostas (concluídas ou pendentes)
        const totalInvestido = apostas.reduce((sum, a) => sum + a.valorApostado, 0);
        // 4. Resultado de Apostas (Lucro/Prejuízo) - APENAS apostas concluídas
        const apostasConcluidas = apostas.filter(a => isApostaConcluida(a.status));
        const resultadoApostas = apostasConcluidas.reduce((sum, a) => {
            return sum + calcularResultadoAposta(a.status, a.valorApostado, a.retornoObtido);
        }, 0);
        // 5. Saldo da Banca
        const saldoBanca = totalDepositado - totalSacado + resultadoApostas;
        // II. MÉTRICAS DE PERFORMANCE
        // 1. Taxa de Acerto (Win Rate) - APENAS apostas concluídas
        const apostasGanhas = apostasConcluidas.filter(a => isApostaGanha(a.status));
        const apostasPerdidas = apostasConcluidas.length - apostasGanhas.length;
        const apostasPendentes = apostas.length - apostasConcluidas.length;
        const taxaAcerto = apostasConcluidas.length > 0
            ? (apostasGanhas.length / apostasConcluidas.length) * 100
            : 0;
        // 2. ROI (Return On Investment) - LucroTotal / TotalInvestido * 100
        const roi = totalInvestido > 0
            ? ((resultadoApostas / totalInvestido) * 100)
            : 0;
        // Lucro Diário - APENAS apostas concluídas
        const lucroDiario = {};
        apostasConcluidas.forEach(aposta => {
            const date = aposta.dataJogo.toISOString().split('T')[0];
            if (!lucroDiario[date]) {
                lucroDiario[date] = 0;
            }
            lucroDiario[date] += calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
        });
        const lucroDiarioArray = Object.entries(lucroDiario)
            .map(([date, value]) => ({ date, lucro: value }))
            .sort((a, b) => a.date.localeCompare(b.date));
        // Lucro Acumulado
        let acumulado = 0;
        const lucroAcumuladoArray = lucroDiarioArray.map(item => {
            acumulado += item.lucro;
            return { ...item, acumulado };
        });
        // Lucro por Tipster - Investido: todas as apostas, Resultado: apenas concluídas
        const lucroPorTipster = {};
        // Calcular investido de todas as apostas
        apostas.forEach(aposta => {
            const tipster = aposta.tipster || 'Sem Tipster';
            if (!lucroPorTipster[tipster]) {
                lucroPorTipster[tipster] = { investido: 0, resultado: 0, lucro: 0 };
            }
            lucroPorTipster[tipster].investido += aposta.valorApostado;
        });
        // Calcular resultado apenas das apostas concluídas
        apostasConcluidas.forEach(aposta => {
            const tipster = aposta.tipster || 'Sem Tipster';
            lucroPorTipster[tipster].resultado += calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
        });
        Object.keys(lucroPorTipster).forEach(tipster => {
            lucroPorTipster[tipster].lucro = lucroPorTipster[tipster].resultado;
        });
        const lucroPorTipsterArray = Object.entries(lucroPorTipster)
            .map(([tipster, dados]) => ({
            tipster,
            investido: Number(dados.investido.toFixed(2)),
            resultado: Number(dados.resultado.toFixed(2)),
            lucro: Number(dados.lucro.toFixed(2))
        }))
            .sort((a, b) => b.lucro - a.lucro);
        // Resumo por Esporte
        const resumoPorEsporte = {};
        apostas.forEach(aposta => {
            if (!resumoPorEsporte[aposta.esporte]) {
                resumoPorEsporte[aposta.esporte] = { apostas: 0, apostasConcluidas: 0, investido: 0, resultado: 0, roi: 0, ganhas: 0, stakeMedia: 0 };
            }
            resumoPorEsporte[aposta.esporte].apostas += 1;
            resumoPorEsporte[aposta.esporte].investido += aposta.valorApostado;
        });
        apostasConcluidas.forEach(aposta => {
            resumoPorEsporte[aposta.esporte].apostasConcluidas += 1;
            const resultado = calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
            resumoPorEsporte[aposta.esporte].resultado += resultado;
            if (isApostaGanha(aposta.status)) {
                resumoPorEsporte[aposta.esporte].ganhas += 1;
            }
        });
        const resumoPorEsporteArray = Object.entries(resumoPorEsporte)
            .map(([esporte, dados]) => ({
            esporte,
            apostas: dados.apostas,
            ganhas: dados.ganhas,
            aproveitamento: dados.apostasConcluidas > 0 ? Number(((dados.ganhas / dados.apostasConcluidas) * 100).toFixed(1)) : 0,
            stakeMedia: dados.apostas > 0 ? Number((dados.investido / dados.apostas).toFixed(2)) : 0,
            investido: Number(dados.investido.toFixed(2)),
            resultado: Number(dados.resultado.toFixed(2)),
            lucro: Number(dados.resultado.toFixed(2)),
            roi: dados.investido > 0 ? Number(((dados.resultado / dados.investido) * 100).toFixed(1)) : 0
        }))
            .sort((a, b) => b.apostas - a.apostas);
        // Resumo por Casa de Aposta
        const resumoPorCasa = {};
        // Adicionar apostas
        apostas.forEach(aposta => {
            if (!resumoPorCasa[aposta.casaDeAposta]) {
                resumoPorCasa[aposta.casaDeAposta] = { apostas: 0, apostasConcluidas: 0, investido: 0, resultado: 0, saldo: 0, ganhas: 0, stakeMedia: 0 };
            }
            resumoPorCasa[aposta.casaDeAposta].apostas += 1;
            resumoPorCasa[aposta.casaDeAposta].investido += aposta.valorApostado;
        });
        // Adicionar resultados das apostas concluídas
        apostasConcluidas.forEach(aposta => {
            resumoPorCasa[aposta.casaDeAposta].apostasConcluidas += 1;
            const resultado = calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
            resumoPorCasa[aposta.casaDeAposta].resultado += resultado;
            if (isApostaGanha(aposta.status)) {
                resumoPorCasa[aposta.casaDeAposta].ganhas += 1;
            }
        });
        // Adicionar transações (depósitos e saques)
        transacoes.forEach(transacao => {
            if (!resumoPorCasa[transacao.casaDeAposta]) {
                resumoPorCasa[transacao.casaDeAposta] = { apostas: 0, apostasConcluidas: 0, investido: 0, resultado: 0, saldo: 0, ganhas: 0, stakeMedia: 0 };
            }
            if (transacao.tipo === 'Depósito') {
                resumoPorCasa[transacao.casaDeAposta].saldo += transacao.valor;
            }
            else if (transacao.tipo === 'Saque') {
                resumoPorCasa[transacao.casaDeAposta].saldo -= transacao.valor;
            }
        });
        // Calcular saldo final (depósitos - saques + resultado de apostas)
        Object.keys(resumoPorCasa).forEach(casa => {
            resumoPorCasa[casa].saldo += resumoPorCasa[casa].resultado;
        });
        const resumoPorCasaArray = Object.entries(resumoPorCasa)
            .map(([casa, dados]) => ({
            casa,
            apostas: dados.apostas,
            ganhas: dados.ganhas,
            aproveitamento: dados.apostasConcluidas > 0 ? Number(((dados.ganhas / dados.apostasConcluidas) * 100).toFixed(1)) : 0,
            stakeMedia: dados.apostas > 0 ? Number((dados.investido / dados.apostas).toFixed(2)) : 0,
            investido: Number(dados.investido.toFixed(2)),
            resultado: Number(dados.resultado.toFixed(2)),
            lucro: Number(dados.resultado.toFixed(2)),
            saldo: Number(dados.saldo.toFixed(2)),
            roi: dados.investido > 0 ? Number(((dados.resultado / dados.investido) * 100).toFixed(1)) : 0
        }))
            .sort((a, b) => b.apostas - a.apostas);
        res.json({
            metricas: {
                roi: Number(roi.toFixed(2)),
                taxaAcerto: Number(taxaAcerto.toFixed(2)),
                lucroTotal: Number(resultadoApostas.toFixed(2)),
                totalInvestido: Number(totalInvestido.toFixed(2)),
                totalDepositado: Number(totalDepositado.toFixed(2)),
                totalSacado: Number(totalSacado.toFixed(2)),
                saldoBanca: Number(saldoBanca.toFixed(2)),
                totalApostas: apostas.length,
                apostasGanhas: apostasGanhas.length,
                apostasPerdidas: Math.max(apostasPerdidas, 0),
                apostasPendentes: Math.max(apostasPendentes, 0)
            },
            lucroDiario: lucroDiarioArray,
            lucroAcumulado: lucroAcumuladoArray,
            lucroPorTipster: lucroPorTipsterArray,
            resumoPorEsporte: resumoPorEsporteArray,
            resumoPorCasa: resumoPorCasaArray
        });
    }
    catch (error) {
        handleRouteError(error, res);
    }
});
// GET /api/analise/performance - Calcular dados de performance
router.get('/performance', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bancaId, dataInicio, dataFim, tipster, casa, esporte, status, oddMin, oddMax, evento } = req.query;
        const bancas = await prisma.bankroll.findMany({
            where: {
                usuarioId: userId,
                ...(bancaId && typeof bancaId === 'string' ? { id: bancaId } : {})
            },
            select: { id: true }
        });
        const bancaIds = bancas.map(b => b.id);
        if (bancaIds.length === 0) {
            return res.json({
                evolucaoRoiMensal: [],
                distribuicaoOdds: [],
                heatmap: {},
                comparacaoBookmakers: [],
                winRatePorEsporte: []
            });
        }
        const where = buildBetWhere({
            bancaIds,
            dataInicio: typeof dataInicio === 'string' ? dataInicio : undefined,
            dataFim: typeof dataFim === 'string' ? dataFim : undefined,
            tipster: typeof tipster === 'string' ? tipster : undefined,
            casa: typeof casa === 'string' ? casa : undefined,
            esporte: typeof esporte === 'string' ? esporte : undefined,
            status: typeof status === 'string' ? status : undefined,
            oddMin: typeof oddMin === 'string' ? oddMin : undefined,
            oddMax: typeof oddMax === 'string' ? oddMax : undefined,
            evento: typeof evento === 'string' ? evento : undefined
        });
        const apostas = await prisma.bet.findMany({
            where,
            orderBy: { dataJogo: 'asc' }
        });
        // Evolução do ROI Mensal - Investido: todas as apostas, Lucro: apenas concluídas
        const roiMensal = {};
        apostas.forEach(aposta => {
            const mes = aposta.dataJogo.toISOString().substring(0, 7); // YYYY-MM
            if (!roiMensal[mes]) {
                roiMensal[mes] = { investido: 0, resultado: 0, roi: 0 };
            }
            roiMensal[mes].investido += aposta.valorApostado;
        });
        // Calcular resultado apenas das apostas concluídas
        const apostasConcluidasPerf = apostas.filter(a => isApostaConcluida(a.status));
        apostasConcluidasPerf.forEach(aposta => {
            const mes = aposta.dataJogo.toISOString().substring(0, 7);
            roiMensal[mes].resultado += calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
        });
        Object.keys(roiMensal).forEach(mes => {
            const { investido, resultado } = roiMensal[mes];
            roiMensal[mes].roi = investido > 0
                ? ((resultado / investido) * 100)
                : 0;
        });
        const evolucaoRoiMensal = Object.entries(roiMensal)
            .map(([mes, dados]) => ({
            mes,
            roi: Number(dados.roi.toFixed(2))
        }))
            .sort((a, b) => a.mes.localeCompare(b.mes));
        // Distribuição de Odds
        const distribuicaoOdds = {};
        apostas.forEach(aposta => {
            const faixa = getFaixaOdd(aposta.odd);
            distribuicaoOdds[faixa] = (distribuicaoOdds[faixa] || 0) + 1;
        });
        const distribuicaoOddsArray = Object.entries(distribuicaoOdds)
            .map(([faixa, quantidade]) => ({ faixa, quantidade }))
            .sort((a, b) => {
            const ordem = ['1.00-1.50', '1.51-2.00', '2.01-3.00', '3.01-5.00', '5.01+'];
            return ordem.indexOf(a.faixa) - ordem.indexOf(b.faixa);
        });
        // Heatmap: ROI por Dia da Semana e Período do Dia - APENAS apostas concluídas
        const heatmap = {};
        const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const periodos = ['Manhã (06-12)', 'Tarde (12-18)', 'Noite (18-24)', 'Madrugada (00-06)'];
        // Primeiro, calcular investido de todas as apostas
        apostas.forEach(aposta => {
            const dia = diasSemana[aposta.dataJogo.getDay()];
            const hora = aposta.dataJogo.getHours();
            let periodo = 'Madrugada (00-06)';
            if (hora >= 6 && hora < 12)
                periodo = 'Manhã (06-12)';
            else if (hora >= 12 && hora < 18)
                periodo = 'Tarde (12-18)';
            else if (hora >= 18)
                periodo = 'Noite (18-24)';
            if (!heatmap[dia]) {
                heatmap[dia] = {};
            }
            if (!heatmap[dia][periodo]) {
                heatmap[dia][periodo] = { investido: 0, resultado: 0, roi: 0 };
            }
            heatmap[dia][periodo].investido += aposta.valorApostado;
        });
        // Depois, calcular resultado apenas das apostas concluídas
        const apostasConcluidasHeatmap = apostas.filter(a => isApostaConcluida(a.status));
        apostasConcluidasHeatmap.forEach(aposta => {
            const dia = diasSemana[aposta.dataJogo.getDay()];
            const hora = aposta.dataJogo.getHours();
            let periodo = 'Madrugada (00-06)';
            if (hora >= 6 && hora < 12)
                periodo = 'Manhã (06-12)';
            else if (hora >= 12 && hora < 18)
                periodo = 'Tarde (12-18)';
            else if (hora >= 18)
                periodo = 'Noite (18-24)';
            heatmap[dia][periodo].resultado += calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
        });
        // Calcular ROI para cada célula do heatmap
        Object.keys(heatmap).forEach(dia => {
            Object.keys(heatmap[dia]).forEach(periodo => {
                const { investido, resultado } = heatmap[dia][periodo];
                heatmap[dia][periodo].roi = investido > 0
                    ? ((resultado / investido) * 100)
                    : 0;
            });
        });
        // Comparação de Bookmakers - Investido: todas, Resultado: apenas concluídas
        const porBookmaker = {};
        apostas.forEach(aposta => {
            const casa = aposta.casaDeAposta;
            if (!porBookmaker[casa]) {
                porBookmaker[casa] = { investido: 0, resultado: 0, roi: 0 };
            }
            porBookmaker[casa].investido += aposta.valorApostado;
        });
        // Calcular resultado apenas das apostas concluídas
        const apostasConcluidasBookmaker = apostas.filter(a => isApostaConcluida(a.status));
        apostasConcluidasBookmaker.forEach(aposta => {
            const casa = aposta.casaDeAposta;
            porBookmaker[casa].resultado += calcularResultadoAposta(aposta.status, aposta.valorApostado, aposta.retornoObtido);
        });
        Object.keys(porBookmaker).forEach(casa => {
            const { investido, resultado } = porBookmaker[casa];
            porBookmaker[casa].roi = investido > 0
                ? ((resultado / investido) * 100)
                : 0;
        });
        const comparacaoBookmakers = Object.entries(porBookmaker)
            .map(([casa, dados]) => ({
            casa,
            investido: Number(dados.investido.toFixed(2)),
            resultado: Number(dados.resultado.toFixed(2)),
            roi: Number(dados.roi.toFixed(2))
        }))
            .sort((a, b) => b.roi - a.roi);
        // Win Rate por Esporte
        const winRatePorEsporte = {};
        apostas.forEach(aposta => {
            if (!winRatePorEsporte[aposta.esporte]) {
                winRatePorEsporte[aposta.esporte] = { total: 0, ganhas: 0, winRate: 0 };
            }
            // Contar apenas apostas concluídas
            if (isApostaConcluida(aposta.status)) {
                winRatePorEsporte[aposta.esporte].total += 1;
                if (isApostaGanha(aposta.status)) {
                    winRatePorEsporte[aposta.esporte].ganhas += 1;
                }
            }
        });
        // Calcular win rate
        Object.keys(winRatePorEsporte).forEach(esporte => {
            const { total, ganhas } = winRatePorEsporte[esporte];
            winRatePorEsporte[esporte].winRate = total > 0
                ? (ganhas / total) * 100
                : 0;
        });
        const winRatePorEsporteArray = Object.entries(winRatePorEsporte)
            .map(([esporte, dados]) => ({
            esporte,
            total: dados.total,
            ganhas: dados.ganhas,
            winRate: Number(dados.winRate.toFixed(2))
        }))
            .filter(item => item.total > 0) // Filtrar apenas esportes com apostas concluídas
            .sort((a, b) => b.winRate - a.winRate);
        res.json({
            evolucaoRoiMensal,
            distribuicaoOdds: distribuicaoOddsArray,
            heatmap,
            comparacaoBookmakers,
            winRatePorEsporte: winRatePorEsporteArray
        });
    }
    catch (error) {
        handleRouteError(error, res);
    }
});
// GET /api/analise/evolucao-bankroll - Evolução do Bankroll ponto a ponto
router.get('/evolucao-bankroll', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const { bancaId } = req.query;
        const bancas = await prisma.bankroll.findMany({
            where: {
                usuarioId: userId,
                ...(bancaId ? { id: bancaId } : {})
            }
        });
        const bancaIds = bancas.map(b => b.id);
        // Buscar todas as transações e apostas concluídas
        const transacoes = await prisma.financialTransaction.findMany({
            where: { bancaId: { in: bancaIds } },
            orderBy: { dataTransacao: 'asc' }
        });
        const apostasConcluidas = await prisma.bet.findMany({
            where: {
                bancaId: { in: bancaIds },
                status: { not: 'Pendente' }
            },
            orderBy: { dataJogo: 'asc' }
        });
        const eventos = [];
        // Adicionar transações
        transacoes.forEach(t => {
            eventos.push({
                data: t.dataTransacao,
                tipo: t.tipo === 'Depósito' ? 'deposito' : 'saque',
                valor: t.tipo === 'Depósito' ? t.valor : -t.valor
            });
        });
        // Adicionar resultados de apostas
        apostasConcluidas.forEach(a => {
            const resultado = calcularResultadoAposta(a.status, a.valorApostado, a.retornoObtido);
            if (resultado !== 0) {
                eventos.push({
                    data: a.dataJogo,
                    tipo: 'aposta',
                    valor: resultado
                });
            }
        });
        // Ordenar eventos por data
        eventos.sort((a, b) => a.data.getTime() - b.data.getTime());
        // Calcular saldo acumulado ponto a ponto
        let saldoAtual = 0;
        const evolucao = eventos.map(evento => {
            saldoAtual += evento.valor;
            return {
                data: evento.data.toISOString(),
                saldo: Number(saldoAtual.toFixed(2)),
                tipo: evento.tipo,
                valor: Number(evento.valor.toFixed(2))
            };
        });
        res.json(evolucao);
    }
    catch (error) {
        handleRouteError(error, res);
    }
});
function getFaixaOdd(odd) {
    if (odd <= 1.5)
        return '1.00-1.50';
    if (odd <= 2.0)
        return '1.51-2.00';
    if (odd <= 3.0)
        return '2.01-3.00';
    if (odd <= 5.0)
        return '3.01-5.00';
    return '5.01+';
}
export default router;
//# sourceMappingURL=analise.routes.js.map