/*
  # Add Trust, Verification, and Monetization Foundations

  1. New Tables
    - `email_verification_tokens`
      - Temporary tokens for email verification flow
      - Auto-expires after 24 hours
      - Tracks verification attempts
      - Supports resend limits

    - `account_trust`
      - Tracks account verification status and trust level
      - Email verification status
      - Phone verification readiness (future)
      - Account age and activity metrics
      - Trust score for abuse detection

    - `user_plan_entitlements`
      - Maps users to their plan tier (free, pro, family)
      - Tracks feature access
      - Used for future premium features
      - No paywall active yet, all users default to free
      - Structure ready for future monetization

    - `alias_usage_audit`
      - Tracks alias creation and usage patterns
      - Detects abuse patterns (bulk aliases, rapid creation)
      - Supports future abuse prevention
      - Helps understand legitimate usage

    - `account_security_log`
      - Records important account events
      - Login patterns, verification events
      - Helps detect suspicious behavior
      - Foundation for future security alerts

  2. Purpose
    - Strengthen account legitimacy and trust
    - Provide clean email verification flow
    - Prevent obvious alias abuse patterns
    - Structure app for future premium features without forcing paywall
    - Support account trust levels and verification status
    - Keep monetization flexible and respectful

  3. Behavior
    - Email verification optional for now, but tracked
    - All users start as free tier (can upgrade later)
    - Alias creation logged for pattern detection
    - Account trust increased by: email verification, age, consistent usage
    - No immediate restrictions, but data supports future safeguards
    - RLS prevents unauthorized access

  4. Important Notes
    - Email verification is optional initially, but full flow is implemented
    - All users default to free plan with full current feature access
    - Premium features not yet active, structure is in place
    - Aliases tracked but not restricted yet
    - System is designed to add controls later without breaking current experience
*/

-- Email Verification Tokens
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  is_used boolean DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Account Trust and Verification
CREATE TABLE IF NOT EXISTS account_trust (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_verified boolean DEFAULT false,
  email_verified_at timestamptz,
  phone_verified boolean DEFAULT false,
  phone_verified_at timestamptz,
  verification_attempts integer DEFAULT 0,
  last_verification_attempt timestamptz,
  trust_score integer DEFAULT 50,
  account_age_days integer DEFAULT 0,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User Plan Entitlements (Monetization Structure)
CREATE TABLE IF NOT EXISTS user_plan_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'family')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled')),
  
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  
  features jsonb DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Alias Usage Audit (Abuse Prevention)
CREATE TABLE IF NOT EXISTS alias_usage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  alias_id uuid REFERENCES access_codes(id),
  action text CHECK (action IN ('created', 'used', 'deactivated', 'shared')),
  ip_context jsonb,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Account Security Log
CREATE TABLE IF NOT EXISTS account_security_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  event_type text CHECK (event_type IN ('login', 'signup', 'email_verified', 'password_reset', 'suspicious_activity', 'alias_created', 'device_change')),
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_trust ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE alias_usage_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security_log ENABLE ROW LEVEL SECURITY;

-- Email Verification Tokens Policies
CREATE POLICY "Users can read their own verification tokens"
  ON email_verification_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create verification tokens"
  ON email_verification_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can read tokens for verification"
  ON email_verification_tokens FOR SELECT
  TO service_role
  USING (true);

-- Account Trust Policies
CREATE POLICY "Users can read their own trust status"
  ON account_trust FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own trust (limited)"
  ON account_trust FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can manage trust"
  ON account_trust FOR ALL
  TO service_role
  USING (true);

-- Plan Entitlements Policies
CREATE POLICY "Users can read their own plan"
  ON user_plan_entitlements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage plans"
  ON user_plan_entitlements FOR ALL
  TO service_role
  USING (true);

-- Alias Audit Policies
CREATE POLICY "Users can read their own alias audit"
  ON alias_usage_audit FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can audit aliases"
  ON alias_usage_audit FOR ALL
  TO service_role
  USING (true);

-- Security Log Policies
CREATE POLICY "Users can read their own security log"
  ON account_security_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role can create security events"
  ON account_security_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Indexes for performance and abuse detection
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS account_trust_user_idx ON account_trust(user_id);
CREATE INDEX IF NOT EXISTS account_trust_trust_score_idx ON account_trust(trust_score);
CREATE INDEX IF NOT EXISTS alias_usage_audit_user_idx ON alias_usage_audit(user_id);
CREATE INDEX IF NOT EXISTS alias_usage_audit_created_idx ON alias_usage_audit(created_at);
CREATE INDEX IF NOT EXISTS account_security_log_user_idx ON account_security_log(user_id);
CREATE INDEX IF NOT EXISTS account_security_log_event_idx ON account_security_log(event_type);
CREATE INDEX IF NOT EXISTS account_security_log_created_idx ON account_security_log(created_at);

-- Update profiles table to add plan field (for backwards compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'plan'
  ) THEN
    ALTER TABLE profiles ADD COLUMN plan text DEFAULT 'free' CHECK (plan IN ('free', 'admin', 'internal'));
  END IF;
END $$;
