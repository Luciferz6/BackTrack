/*
  Warnings:

  - You are about to drop the column `descricaoApostaDetalhada` on the `bets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bets" DROP COLUMN "descricaoApostaDetalhada",
ADD COLUMN     "aposta" TEXT;
