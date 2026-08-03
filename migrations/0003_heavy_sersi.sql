-- Add admin-controlled LoRA category field
-- Uses IF NOT EXISTS so it is safe to apply to databases that already have the column via drizzle push
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "lora_category" text;
