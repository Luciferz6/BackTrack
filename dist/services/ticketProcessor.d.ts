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
export declare const processTicket: ({ base64Image, mimeType, ocrText }: {
    base64Image: string;
    mimeType: string;
    ocrText?: string;
}) => Promise<NormalizedTicketData>;
//# sourceMappingURL=ticketProcessor.d.ts.map