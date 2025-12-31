-- Add daily_link_limit column to users table
-- NULL = use global config
-- 0 = unlimited (no limit)
-- positive number = custom daily limit for that user
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_link_limit INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.daily_link_limit IS 'Per-user daily link limit. NULL=use global config, 0=unlimited, positive=custom limit';

