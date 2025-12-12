const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const normalizeEsporteKey = (value) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(EMOJI_REGEX, '')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const BASE_ESPORTES = [
    'Airsoft',
    'Arco e Flecha',
    'Atletismo',
    'Automobilismo',
    'Badminton',
    'Basquete',
    'Basquete 3x3',
    'Beisebol',
    'Biato',
    'Biliar',
    'Bobsled',
    'Bocha',
    'Bodyboard',
    'Cheerleading',
    'Ciclismo',
    'Corrida de Aventura',
    'Corrida de Cavalos',
    'Corrida de Galgos',
    'Corrida de Montanha',
    'Corrida de Obstáculos',
    'Corrida de Rua',
    'Corrida de Velocidade',
    'Corrida em Trilhas',
    'Corrida Hípica',
    'Criquete',
    'Curling',
    'Damas',
    'Dança Esportiva',
    'Dardos',
    'Dodgeball',
    'E-Sports',
    'Escalada',
    'Escalada Indoor',
    'Esgrima',
    'Futebol Americano',
    'Futebol Australiano',
    'Futebol Canadense',
    'Futebol de Areia',
    'Futebol de Salão',
    'Futebol Society',
    'Futebol',
    'Hóquei no Gelo',
    'Hóquei Subaquático',
    'Judo',
    'Kabbadi',
    'Karate',
    'Kart',
    'Kickball',
    'Outros',
    'Outros Esportes',
    'Paintball',
    'Parapente',
    'Parkour',
    'Patinação Artística',
    'Patinação de Velocidade',
    'Queimada',
    'Rali',
    'Remo',
    'Rodeio',
    'Rugby',
    'Rugby de Praia',
    'Sepaktakraw',
    'Triatlo',
    'Ultramaratona',
    'Tênis',
    'Vela',
    'Vôlei',
    'Vôlei de Praia'
];
const EMOJI_MAP_DATA = [
    ['Airsoft', '🔫'],
    ['Arco e Flecha', '🏹'],
    ['Atletismo', '🏃'],
    ['Automobilismo', '🏎️'],
    ['Badminton', '🏸'],
    ['Basquete', '🏀'],
    ['Basquete 3x3', '🏀'],
    ['Beisebol', '⚾'],
    ['Biliar', '🎱'],
    ['Bodyboard', '🏄'],
    ['Ciclismo', '🚴'],
    ['Corrida de Aventura', '🥾'],
    ['Corrida de Cavalos', '🏇'],
    ['Corrida de Montanha', '⛰️'],
    ['Corrida de Obstáculos', '🚧'],
    ['Corrida de Rua', '🏃'],
    ['Corrida em Trilhas', '🥾'],
    ['Criquete', '🏏'],
    ['Curling', '🥌'],
    ['Dardos', '🎯'],
    ['E-Sports', '🎮'],
    ['Escalada', '🧗'],
    ['Escalada Indoor', '🧗'],
    ['Esgrima', '🤺'],
    ['Futebol Americano', '🏈'],
    ['Futebol Australiano', '🏉'],
    ['Futebol Canadense', '🏈'],
    ['Futebol de Areia', '⚽'],
    ['Futebol de Salão', '⚽'],
    ['Futebol Society', '⚽'],
    ['Futebol', '⚽'],
    ['Hóquei no Gelo', '🏒'],
    ['Judo', '🥋'],
    ['Kabbadi', '🤼'],
    ['Karate', '🥋'],
    ['Kart', '🏎️'],
    ['Outros', '✨'],
    ['Outros Esportes', '✨'],
    ['Paintball', '🎯'],
    ['Parapente', '🪂'],
    ['Parkour', '🤸'],
    ['Patinação Artística', '⛸️'],
    ['Patinação de Velocidade', '⛸️'],
    ['Queimada', '🏐'],
    ['Rali', '🚗'],
    ['Remo', '🚣'],
    ['Rodeio', '🤠'],
    ['Rugby', '🏉'],
    ['Rugby de Praia', '🏉'],
    ['Sepaktakraw', '🏐'],
    ['Triatlo', '🏊'],
    ['Tênis', '🎾'],
    ['Vela', '⛵'],
    ['Vôlei', '🏐'],
    ['Vôlei de Praia', '🏐']
];
const ESPORTE_EMOJI_MAP = EMOJI_MAP_DATA.reduce((acc, [nome, emoji]) => {
    acc[normalizeEsporteKey(nome)] = emoji;
    return acc;
}, {});
const ALIAS_MAP_DATA = [
    ['soccer', 'Futebol'],
    ['futebol', 'Futebol'],
    ['football', 'Futebol Americano'],
    ['american football', 'Futebol Americano'],
    ['basketball', 'Basquete'],
    ['horse racing', 'Corrida de Cavalos'],
    ['curling', 'Curling'],
    ['esports', 'E-Sports'],
    ['e sports', 'E-Sports'],
    ['hockey', 'Hóquei no Gelo'],
    ['beisebol', 'Beisebol'],
    ['baseball', 'Beisebol'],
    ['tennis', 'Tênis'],
    ['tênis', 'Tênis'],
    ['futebol americano', 'Futebol Americano'],
    ['outros esportes', 'Outros Esportes']
];
const ESPORTE_ALIAS_MAP = ALIAS_MAP_DATA.reduce((acc, [alias, destino]) => {
    acc[normalizeEsporteKey(alias)] = destino;
    return acc;
}, {});
const decorateWithEmoji = (value) => {
    const emoji = ESPORTE_EMOJI_MAP[normalizeEsporteKey(value)];
    if (!emoji)
        return value;
    return value.includes(emoji) ? value : `${value} ${emoji}`;
};
export const formatEsporteComEmoji = (value) => {
    if (!value)
        return '';
    return decorateWithEmoji(value.trim());
};
const stripEsporteEmoji = (value) => value.replace(EMOJI_REGEX, '').replace(/\s+/g, ' ').trim();
const findBaseEsporte = (value) => {
    if (!value)
        return null;
    const normalized = normalizeEsporteKey(value);
    if (!normalized)
        return null;
    if (ESPORTE_ALIAS_MAP[normalized]) {
        return ESPORTE_ALIAS_MAP[normalized];
    }
    const exact = BASE_ESPORTES.find((esporte) => normalizeEsporteKey(esporte) === normalized);
    if (exact) {
        return exact;
    }
    const partial = BASE_ESPORTES.find((esporte) => {
        const esporteKey = normalizeEsporteKey(esporte);
        return esporteKey.includes(normalized) || normalized.includes(esporteKey);
    });
    return partial ?? null;
};
export const normalizarEsporteParaOpcao = (value) => {
    if (!value)
        return '';
    const base = findBaseEsporte(value);
    if (base) {
        return formatEsporteComEmoji(base);
    }
    return formatEsporteComEmoji(stripEsporteEmoji(value));
};
export const stripEsporteComEmoji = stripEsporteEmoji;
export default normalizarEsporteParaOpcao;
//# sourceMappingURL=esportes.js.map