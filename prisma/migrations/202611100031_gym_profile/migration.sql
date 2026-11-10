-- Profile labels only. Financial currency and Manila membership rules are unchanged.
ALTER TABLE gyms
  ADD COLUMN contact_email text,
  ADD COLUMN phone text,
  ADD COLUMN address text,
  ADD COLUMN profile_timezone text NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN profile_country text NOT NULL DEFAULT 'Philippines',
  ADD COLUMN profile_currency text NOT NULL DEFAULT 'PHP',
  ADD COLUMN profile_version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT gym_profile_version_positive CHECK (profile_version > 0);
-- Existing forced tenant RLS and runtime privileges apply to these additive columns.
