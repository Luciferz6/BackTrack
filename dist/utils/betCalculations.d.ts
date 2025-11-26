/**
 * Calcula o resultado financeiro de uma aposta baseado no status
 * @param status - Status da aposta
 * @param valorApostado - Valor apostado (stake)
 * @param retornoObtido - Retorno obtido (ganho), se houver
 * @returns Resultado financeiro (lucro/prejuízo)
 */
export declare function calcularResultadoAposta(status: string, valorApostado: number, retornoObtido: number | null): number;
/**
 * Verifica se uma aposta está concluída (não pendente)
 */
export declare function isApostaConcluida(status: string): boolean;
/**
 * Verifica se uma aposta é considerada ganha para cálculo de win rate
 */
export declare function isApostaGanha(status: string): boolean;
//# sourceMappingURL=betCalculations.d.ts.map