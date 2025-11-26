declare const logger: import("pino").Logger<never>;
export declare const log: {
    info: (obj: object | string, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: object | string, msg?: string) => void;
    debug: (obj: object | string, msg?: string) => void;
};
export default logger;
//# sourceMappingURL=logger.d.ts.map