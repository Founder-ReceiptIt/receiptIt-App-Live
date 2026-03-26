/*
  # Add email column to profiles table

  ## Changes
  - Adds `email` column to profiles table to store the user's email address
  - This allows us to store and display the email alongside other profile data

  ## Migration Details
  - Column: `email` (text, nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text;
  END IF;
END $$;
