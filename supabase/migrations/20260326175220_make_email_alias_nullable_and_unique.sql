/*
  # Make email_alias nullable and unique

  1. Changes
    - Make `email_alias` column nullable in profiles table
    - Add unique constraint to `email_alias` to prevent duplicates
    - This allows users to sign up without an alias and prevents duplicate aliases

  2. Security
    - Maintains existing RLS policies
    - Ensures alias uniqueness across all users

  3. Important Notes
    - Users can now have NULL email_alias during initial signup
    - Application logic will force alias creation before app access
    - No two users can have the same email alias
*/

-- Make email_alias nullable
ALTER TABLE profiles 
ALTER COLUMN email_alias DROP NOT NULL;

-- Add unique constraint to prevent duplicate aliases
-- First, we need to handle any existing empty strings by setting them to NULL
UPDATE profiles SET email_alias = NULL WHERE email_alias = '';

-- Now add the unique constraint (NULL values are allowed and don't conflict)
ALTER TABLE profiles 
ADD CONSTRAINT profiles_email_alias_unique UNIQUE (email_alias);
