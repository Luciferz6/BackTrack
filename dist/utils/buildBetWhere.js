/**
 * Constrói o objeto where para queries de apostas com validação de tipos
 */
export function buildBetWhere(params) {
    const where = {
        bancaId: { in: params.bancaIds }
    };
    if (params.dataInicio || params.dataFim) {
        where.dataJogo = {};
        if (params.dataInicio) {
            const dataInicio = new Date(params.dataInicio);
            if (!isNaN(dataInicio.getTime())) {
                where.dataJogo.gte = dataInicio;
            }
        }
        if (params.dataFim) {
            const dataFim = new Date(params.dataFim);
            if (!isNaN(dataFim.getTime())) {
                where.dataJogo.lte = dataFim;
            }
        }
    }
    if (params.tipster) {
        where.tipster = { contains: params.tipster, mode: 'insensitive' };
    }
    if (params.casa) {
        where.casaDeAposta = { contains: params.casa, mode: 'insensitive' };
    }
    if (params.esporte) {
        where.esporte = { contains: params.esporte, mode: 'insensitive' };
    }
    if (params.status) {
        where.status = params.status;
    }
    if (params.oddMin || params.oddMax) {
        where.odd = {};
        if (params.oddMin) {
            const oddMin = parseFloat(params.oddMin);
            if (!isNaN(oddMin) && oddMin > 0) {
                where.odd.gte = oddMin;
            }
        }
        if (params.oddMax) {
            const oddMax = parseFloat(params.oddMax);
            if (!isNaN(oddMax) && oddMax > 0) {
                where.odd.lte = oddMax;
            }
        }
    }
    if (params.evento) {
        where.OR = [
            { jogo: { contains: params.evento, mode: 'insensitive' } },
            { mercado: { contains: params.evento, mode: 'insensitive' } },
            { tipoAposta: { contains: params.evento, mode: 'insensitive' } },
            { torneio: { contains: params.evento, mode: 'insensitive' } },
            { pais: { contains: params.evento, mode: 'insensitive' } }
        ];
    }
    return where;
}
//# sourceMappingURL=buildBetWhere.js.map