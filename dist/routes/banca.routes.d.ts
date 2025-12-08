import { z } from 'zod';
declare const router: import("express-serve-static-core").Router;
export declare const createBancaSchema: z.ZodEffects<z.ZodObject<{
    nome: z.ZodString;
    descricao: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Ativa", "Inativa"]>>;
    ePadrao: z.ZodOptional<z.ZodBoolean>;
    saldoInicial: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, unknown>>;
}, "strip", z.ZodTypeAny, {
    nome: string;
    status?: "Ativa" | "Inativa" | undefined;
    descricao?: string | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: number | undefined;
}, {
    nome: string;
    status?: "Ativa" | "Inativa" | undefined;
    descricao?: string | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: unknown;
}>, {
    descricao: string | undefined;
    nome: string;
    status?: "Ativa" | "Inativa" | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: number | undefined;
}, {
    nome: string;
    status?: "Ativa" | "Inativa" | undefined;
    descricao?: string | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: unknown;
}>;
export declare const updateBancaSchema: z.ZodObject<{
    nome: z.ZodOptional<z.ZodString>;
    descricao: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Ativa", "Inativa"]>>;
    ePadrao: z.ZodOptional<z.ZodBoolean>;
    saldoInicial: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, unknown>>;
}, "strip", z.ZodTypeAny, {
    status?: "Ativa" | "Inativa" | undefined;
    nome?: string | undefined;
    descricao?: string | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: number | undefined;
}, {
    status?: "Ativa" | "Inativa" | undefined;
    nome?: string | undefined;
    descricao?: string | undefined;
    ePadrao?: boolean | undefined;
    saldoInicial?: unknown;
}>;
export declare const sanitizeBankroll: <T extends Record<string, unknown>>(banca: T) => Omit<T, "cor">;
export default router;
//# sourceMappingURL=banca.routes.d.ts.map