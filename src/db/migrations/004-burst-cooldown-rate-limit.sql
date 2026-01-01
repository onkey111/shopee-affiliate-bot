-- Migration: Update rate limit system from daily limit to burst + cooldown
-- The new system uses link creation timestamps from the links table
-- No schema changes needed - we reuse existing links.created_at column

-- Update comment on daily_link_limit column to reflect new usage
-- NULL = use default burst + cooldown (10 links/hour, then 1 link/30min)
-- 0 = unlimited (no rate limit)
-- Note: Positive numbers are no longer used in the new system
COMMENT ON COLUMN users.daily_link_limit IS 'Rate limit setting. NULL=default burst+cooldown, 0=unlimited';

-- Create index on links.created_at for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at);

-- Create composite index for user rate limit lookups
CREATE INDEX IF NOT EXISTS idx_links_user_created ON links(user_id, created_at DESC);

