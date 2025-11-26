/**
 * Calcula o resultado financeiro de uma aposta baseado no status
 * @param status - Status da aposta
 * @param valorApostado - Valor apostado (stake)
 * @param retornoObtido - Retorno obtido (ganho), se houver
 * @returns Resultado financeiro (lucro/prejuízo)
 */
export function calcularResultadoAposta(
  status: string,
  valorApostado: number,
  retornoObtido: number | null
): number {
  switch (status) {
    case 'Ganha':
      // Ganha: retorno - stake = lucro
      return retornoObtido ? retornoObtido - valorApostado : 0;
    
    case 'Perdida':
      // Perdida: -stake = prejuízo
      return -valorApostado;
    
    case 'Meio Ganha':
      // Meio Ganha: metade do lucro
      return retornoObtido ? (retornoObtido - valorApostado) / 2 : -valorApostado / 2;
    
    case 'Meio Perdida':
      // Meio Perdida: metade do prejuízo
      return -valorApostado / 2;
    
    case 'Cashout':
      // Cashout: retorno do cashout - stake
      return retornoObtido ? retornoObtido - valorApostado : 0;
    
    case 'Reembolsada':
      // Reembolsada: não afeta (stake devolvido)
      return 0;
    
    case 'Void':
      // Void: não afeta
      return 0;
    
    case 'Pendente':
      // Pendente: não deve ser incluído nos cálculos
      return 0;
    
    default:
      // Status desconhecido: tratar como 0
      return 0;
  }
}

/**
 * Verifica se uma aposta está concluída (não pendente)
 */
export function isApostaConcluida(status: string): boolean {
  return status !== 'Pendente';
}

/**
 * Verifica se uma aposta é considerada ganha para cálculo de win rate
 */
export function isApostaGanha(status: string): boolean {
  return status === 'Ganha' || status === 'Meio Ganha';
}

