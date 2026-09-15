import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function ExpenseList({ user, onAddAnother, onCreateReport }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let query = supabase
      .from('expense_details')
      .select('*')
      .order('created_at', { ascending: false })

    if (user?.email) {
      query = query.eq('user_email', user.email)
    }

    query.then(({ data }) => {
      setExpenses(data || [])
      setLoading(false)
    })
  }, [user?.email])

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text)', marginBottom: '20px' }}>
        Your Expenses
      </div>

      {loading && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading...</div>
      )}

      {!loading && expenses.length === 0 && (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No expenses saved yet.</div>
      )}

      {!loading && expenses.length > 0 && (
        <div style={{ border: '1px solid var(--taupe-200)', borderRadius: 'var(--radius-sm)', marginBottom: '20px', overflow: 'hidden' }}>
          {expenses.map((exp, i) => (
            <div
              key={exp.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0 16px', height: '64px',
                borderBottom: i < expenses.length - 1 ? '1px solid var(--taupe-200)' : 'none',
                background: 'var(--surface-card)',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  {exp.vendor || 'Unknown vendor'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {exp.date || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                  {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
                </div>
                <div style={{
                  fontSize: '11px', fontWeight: 500,
                  padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                  background: exp.status === 'saved' ? 'var(--moss-bg)' : 'var(--gold-bg)',
                  color: exp.status === 'saved' ? 'var(--moss)' : 'var(--gold-text)',
                }}>
                  {exp.status || 'saved'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={onAddAnother}
          style={{
            width: '100%', height: '48px', background: 'var(--surface-card)', color: 'var(--text)',
            border: '1px solid var(--action)', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Add another expense
        </button>
        <button
          onClick={() => onCreateReport && onCreateReport(expenses)}
          style={{
            width: '100%', height: '48px', background: 'var(--action)', color: 'var(--surface-card)',
            border: 'none', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: 'var(--radius-sm)',
          }}
        >
          Create expense report
        </button>
      </div>
    </div>
  )
}
