/*
# Create profiles table with secure auth integration

1. New Tables
   - `profiles`
     - `id` (uuid, primary key) — references auth.users(id), the secure built-in auth table
     - `email` (text) — the user's email, mirrored from auth for convenience
     - `full_name` (text) — optional display name
     - `created_at` (timestamptz) — when the profile was created

2. Security
   - Enable RLS on `profiles`.
   - Four owner-scoped policies (select/insert/update/delete) so each authenticated
     user can only access their own profile row (auth.uid() = id).
   - Passwords are NEVER stored here — Supabase Auth (auth.users) securely hashes
     and manages credentials. This table only holds non-sensitive profile data.

3. Automation
   - `handle_new_user()` trigger function (SECURITY DEFINER) automatically inserts a
     profile row whenever a new user signs up, so a profile always exists.

Important Notes:
   1. The profile id is tied to the auth user id, keeping identity consistent.
   2. Deleting the auth user cascades to delete the profile.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
