/*
  # Add username field to profiles table

  ## Changes
  - Adds `username` column to profiles table to store the user's display name
  - This allows us to fetch the username alongside other profile data instead of relying on auth.users metadata

  ## Migration Details
  - Column: `username` (text, nullable initially to handle existing records)
  - For existing records, username will be populated from auth.users.raw_user_meta_data on next login
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE profiles ADD COLUMN username text;
  END IF;
END $$;
