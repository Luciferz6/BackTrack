-- CreateTable
CREATE TABLE IF NOT EXISTS "plans" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "limiteApostasMensais" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "membroDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusConta" TEXT NOT NULL DEFAULT 'Ativa',
    "planoId" TEXT NOT NULL,
    "telegramId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bankrolls" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT DEFAULT '#2563eb',
    "status" TEXT NOT NULL DEFAULT 'Ativa',
    "ePadrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bankrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "financial_transactions" (
    "id" TEXT NOT NULL,
    "bancaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "casaDeAposta" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataTransacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "bets" (
    "id" TEXT NOT NULL,
    "bancaId" TEXT NOT NULL,
    "esporte" TEXT NOT NULL,
    "jogo" TEXT NOT NULL,
    "torneio" TEXT,
    "pais" TEXT,
    "mercado" TEXT NOT NULL,
    "tipoAposta" TEXT NOT NULL,
    "valorApostado" DOUBLE PRECISION NOT NULL,
    "odd" DOUBLE PRECISION NOT NULL,
    "bonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataJogo" TIMESTAMP(3) NOT NULL,
    "tipster" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "casaDeAposta" TEXT NOT NULL,
    "retornoObtido" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- Tipsters será criado pela migração específica 20250118120000_add_tipsters.
-- Nenhuma estrutura de tipsters (índices/constraints) é criada aqui.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "plans_nome_key" ON "plans"("nome");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegramId_key" ON "users"("telegramId") WHERE "telegramId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bankrolls" ADD CONSTRAINT "bankrolls_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_bancaId_fkey" FOREIGN KEY ("bancaId") REFERENCES "bankrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_bancaId_fkey" FOREIGN KEY ("bancaId") REFERENCES "bankrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

