import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function FinanceNavButton({ onViewFinance }) {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { count } = await supabase
        .from('expense_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')

      setPendingCount(count || 0)
    }
    load()
  }, [])

  return (
    <div
      onClick={onViewFinance}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', border: '1px solid var(--taupe-200)',
        cursor: 'pointer', background: 'var(--surface-card)', marginTop: '8px',
      }}
    >
      <div style={{ fontSize: '14px', color: 'var(--text)' }}>Finance — reimbursements</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {pendingCount > 0 && (
          <div style={{
            minWidth: '20px', height: '20px', borderRadius: 'var(--radius-lg)',
            background: 'var(--action)', color: 'var(--surface-card)',
            fontSize: '11px', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 6px',
          }}>
            {pendingCount}
          </div>
        )}
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>→</div>
      </div>
    </div>
  )
}
