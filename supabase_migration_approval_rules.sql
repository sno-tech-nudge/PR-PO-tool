-- Configurable expense-report approval rules (Settings > Custom Approval,
-- finance + admin). Replaces the hardcoded ₹50k/₹2L cutoffs that used to
-- live independently in src/lib/approvalEngine.js and src/lib/policyEngine.js
-- with a single source of truth both now read from — see
-- src/lib/approvalEngine.js getApprovalRules()/getApprovalLevels().
--
-- Matching: a rule applies to an amount when
--   (min_amount is null or amount > min_amount) and
--   (max_amount is null or amount <= max_amount)
-- Rules are evaluated in sort_order and the first match wins.
create table if not exists approval_rules (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  min_amount numeric,
  max_amount numeric,
  mode text not null default 'configure',  -- 'configure' | 'auto_approve' | 'auto_reject'
  levels jsonb not null default '[]',      -- [{label, required_role}], used when mode='configure'
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
