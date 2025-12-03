-- Add optional profile photo field to users
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "fotoPerfil" TEXT;
