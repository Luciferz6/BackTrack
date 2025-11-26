// Valida se uma cor é válida (não vazia e é string)
export const isValidColor = (color) => {
    return !!(color && typeof color === 'string' && color.trim() !== '');
};
// Normaliza uma cor (retorna cor válida ou undefined para usar default do banco)
export const normalizeColor = (color) => {
    if (!color || typeof color !== 'string' || color.trim() === '') {
        return undefined;
    }
    return color.trim();
};
//# sourceMappingURL=colorValidation.js.map