-- createApprovalRecords() (src/lib/approvalEngine.js) is called from a
-- SubmissionConfirmation.jsx useEffect with no idempotency guard. React 18
-- StrictMode double-invokes that effect in dev, and any real remount
-- (slow network, back/forward nav) can double-invoke it in prod too — both
-- produced real duplicate report_approvals rows in production. This
-- constraint lets createApprovalRecords upsert with onConflict + ignoreDuplicates
-- instead of a bare insert.
ALTER TABLE report_approvals
  ADD CONSTRAINT report_approvals_report_level_unique UNIQUE (report_id, approver_level);
