-- Links a person's two accounts (e.g. a thenudge.org login and a
-- thedelta.org.in login for the same real human) so their "own records"
-- views resolve across both identities. Nullable and unset for everyone
-- except the specific pairs an admin has confirmed are the same person —
-- never inferred automatically from name matching.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS linked_email text;
