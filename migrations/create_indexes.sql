-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email ON auth_tokens(email);
CREATE INDEX IF NOT EXISTS idx_usage_fingerprint ON usage_tracking(fingerprint);
CREATE INDEX IF NOT EXISTS idx_usage_ip_hash ON usage_tracking(ip_hash);
CREATE INDEX IF NOT EXISTS idx_usage_used_at ON usage_tracking(used_at);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_feed(created_at);
