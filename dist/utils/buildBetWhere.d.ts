import { Prisma } from '@prisma/client';
interface BetFilterParams {
    bancaIds: string[];
    dataInicio?: string;
    dataFim?: string;
    tipster?: string;
    casa?: string;
    esporte?: string;
    status?: string;
    oddMin?: string;
    oddMax?: string;
    evento?: string;
}
/**
 * Constrói o objeto where para queries de apostas com validação de tipos
 */
export declare function buildBetWhere(params: BetFilterParams): Prisma.BetWhereInput;
export {};
//# sourceMappingURL=buildBetWhere.d.ts.map