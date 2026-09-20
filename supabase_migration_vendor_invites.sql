-- Vendor self-registration via a shareable public link (Vendor Management
-- > "Invite Vendor to Register"). See src/components/vendor/VendorInviteModal.jsx
-- (creates a row + shows the link) and src/components/vendor/PublicVendorRegister.jsx
-- (the no-login public form, reached at /vendor-register/:token).
--
-- Same anon-key trust model as every other table in this app (see
-- supabase_migration_vendor_bank_change_log_rls.sql) — RLS is enabled with
-- an open policy rather than left disabled, for consistency with the rest
-- of the schema.
create table if not exists vendor_invites (
  id bigint generated always as identity primary key,
  token text not null unique,
  created_by_email text not null,
  created_by_name text,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  vendor_id uuid references vendors(id)
);

alter table vendor_invites enable row level security;

drop policy if exists vendor_invites_all on vendor_invites;
create policy vendor_invites_all on vendor_invites for all using (true) with check (true);
