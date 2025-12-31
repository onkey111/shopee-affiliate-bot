-- Conversion Jobs table for queue-based link processing
-- Tracks the status of affiliate link conversion jobs

-- Job status enum
DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main conversion jobs table
CREATE TABLE IF NOT EXISTS conversion_jobs (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    affiliate_url TEXT,
    status job_status DEFAULT 'pending',
    error_message TEXT,
    attempts INT DEFAULT 0,
    telegram_chat_id BIGINT NOT NULL,
    telegram_message_id BIGINT,
    bullmq_job_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Dead letter jobs table for jobs that failed after max retries
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id SERIAL PRIMARY KEY,
    original_job_id INT,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    original_url TEXT NOT NULL,
    error_message TEXT,
    attempts INT DEFAULT 0,
    telegram_chat_id BIGINT,
    failed_at TIMESTAMP DEFAULT NOW(),
    retried_at TIMESTAMP,
    retry_job_id INT,
    purged_at TIMESTAMP
);

-- Indexes for conversion_jobs
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_user_id ON conversion_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_created_at ON conversion_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_bullmq_job_id ON conversion_jobs(bullmq_job_id);
CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status_created ON conversion_jobs(status, created_at);

-- Indexes for dead_letter_jobs
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_user_id ON dead_letter_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_failed_at ON dead_letter_jobs(failed_at);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_purged_at ON dead_letter_jobs(purged_at);

-- Add comment for documentation
COMMENT ON TABLE conversion_jobs IS 'Tracks affiliate link conversion jobs processed by BullMQ workers';
COMMENT ON TABLE dead_letter_jobs IS 'Stores jobs that failed after maximum retry attempts for manual review';
COMMENT ON COLUMN conversion_jobs.bullmq_job_id IS 'Reference to the BullMQ job ID for correlation';
COMMENT ON COLUMN conversion_jobs.attempts IS 'Number of processing attempts made';
COMMENT ON COLUMN dead_letter_jobs.retry_job_id IS 'ID of new job if this dead letter job was retried';

