/*
  Warnings:

  - You are about to drop the column `cor` on the `bankrolls` table. All the data in the column will be lost.
  - You are about to drop the column `limiteApostasMensais` on the `plans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "bankrolls" DROP COLUMN "cor";

-- AlterTable
ALTER TABLE "bets" ADD COLUMN     "descricaoApostaDetalhada" TEXT;

-- AlterTable
ALTER TABLE "plans" DROP COLUMN "limiteApostasMensais";
