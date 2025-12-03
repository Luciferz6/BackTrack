-- Views para organizar dados por usuário no Prisma Studio

-- View: Dados completos do usuário
CREATE OR REPLACE VIEW "user_complete_data" AS
SELECT 
    u.id as user_id,
    u."nomeCompleto" as user_nome,
    u.email as user_email,
    u."statusConta" as user_status,
    u."membroDesde" as user_membro_desde,
    u."telegramId" as user_telegram_id,
    p.nome as plano_nome,
    p.preco as plano_preco,
    p."limiteApostasDiarias" as plano_limite,
    COUNT(DISTINCT b.id) as total_bancas,
    COUNT(DISTINCT t.id) as total_tipsters,
    COUNT(DISTINCT bet.id) as total_apostas,
    COUNT(DISTINCT ft.id) as total_transacoes
FROM users u
LEFT JOIN plans p ON u."planoId" = p.id
LEFT JOIN bankrolls b ON b."usuarioId" = u.id
LEFT JOIN tipsters t ON t."usuarioId" = u.id
LEFT JOIN bets bet ON bet."bancaId" = b.id
LEFT JOIN financial_transactions ft ON ft."bancaId" = b.id
GROUP BY u.id, u."nomeCompleto", u.email, u."statusConta", u."membroDesde", u."telegramId", p.nome, p.preco, p."limiteApostasDiarias";

-- View: Bancas do usuário com resumo
CREATE OR REPLACE VIEW "user_bankrolls_summary" AS
SELECT 
    u.id as user_id,
    u."nomeCompleto" as user_nome,
    b.id as banca_id,
    b.nome as banca_nome,
    b.descricao as banca_descricao,
    b.status as banca_status,
    b."ePadrao" as banca_padrao,
    b."criadoEm" as banca_criada_em,
    COUNT(DISTINCT bet.id) as total_apostas,
    COUNT(DISTINCT ft.id) as total_transacoes,
    COALESCE(SUM(CASE WHEN ft.tipo = 'Depósito' THEN ft.valor ELSE 0 END), 0) as total_depositos,
    COALESCE(SUM(CASE WHEN ft.tipo = 'Saque' THEN ft.valor ELSE 0 END), 0) as total_saques
FROM users u
INNER JOIN bankrolls b ON b."usuarioId" = u.id
LEFT JOIN bets bet ON bet."bancaId" = b.id
LEFT JOIN financial_transactions ft ON ft."bancaId" = b.id
GROUP BY u.id, u."nomeCompleto", b.id, b.nome, b.descricao, b.status, b."ePadrao", b."criadoEm";

-- View: Apostas do usuário (através das bancas)
CREATE OR REPLACE VIEW "user_bets" AS
SELECT 
    u.id as user_id,
    u."nomeCompleto" as user_nome,
    b.id as banca_id,
    b.nome as banca_nome,
    bet.id as aposta_id,
    bet.esporte,
    bet.jogo,
    bet.torneio,
    bet.pais,
    bet.mercado,
    bet."tipoAposta",
    bet."valorApostado",
    bet.odd,
    bet.bonus,
    bet."dataJogo",
    bet.tipster,
    bet.status,
    bet."casaDeAposta",
    bet."retornoObtido",
    bet."createdAt" as aposta_criada_em
FROM users u
INNER JOIN bankrolls b ON b."usuarioId" = u.id
INNER JOIN bets bet ON bet."bancaId" = b.id;

-- View: Transações do usuário (através das bancas)
CREATE OR REPLACE VIEW "user_transactions" AS
SELECT 
    u.id as user_id,
    u."nomeCompleto" as user_nome,
    b.id as banca_id,
    b.nome as banca_nome,
    ft.id as transacao_id,
    ft.tipo,
    ft."casaDeAposta",
    ft.valor,
    ft."dataTransacao",
    ft.observacao,
    ft."createdAt" as transacao_criada_em
FROM users u
INNER JOIN bankrolls b ON b."usuarioId" = u.id
INNER JOIN financial_transactions ft ON ft."bancaId" = b.id;

-- View: Tipsters do usuário
CREATE OR REPLACE VIEW "user_tipsters" AS
SELECT 
    u.id as user_id,
    u."nomeCompleto" as user_nome,
    t.id as tipster_id,
    t.nome as tipster_nome,
    t.ativo as tipster_ativo,
    t."createdAt" as tipster_criado_em
FROM users u
INNER JOIN tipsters t ON t."usuarioId" = u.id;

