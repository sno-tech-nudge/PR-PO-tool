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
      <div style={{ fontSize: '20px', fontWeight: 500, color: '#1A1A1A', marginBottom: '20px' }}>
        Your Expenses
      </div>

      {loading && (
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>Loading...</div>
      )}

      {!loading && expenses.length === 0 && (
        <div style={{ fontSize: '13px', color: '#6B6B6B' }}>No expenses saved yet.</div>
      )}

      {!loading && expenses.length > 0 && (
        <div style={{ border: '1px solid #E8E8E8', borderRadius: '4px', marginBottom: '20px', overflow: 'hidden' }}>
          {expenses.map((exp, i) => (
            <div
              key={exp.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0 16px', height: '64px',
                borderBottom: i < expenses.length - 1 ? '1px solid #E8E8E8' : 'none',
                background: '#FFFFFF',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
                  {exp.vendor || 'Unknown vendor'}
                </div>
                <div style={{ fontSize: '12px', color: '#6B6B6B', marginTop: '2px' }}>
                  {exp.date || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#1A1A1A' }}>
                  {exp.amount ? `₹${Number(exp.amount).toLocaleString('en-IN')}` : '—'}
                </div>
                <div style={{
                  fontSize: '11px', fontWeight: 500,
                  padding: '3px 8px', borderRadius: '4px',
                  background: exp.status === 'saved' ? '#F0FDF4' : '#FEFCE8',
                  color: exp.status === 'saved' ? '#16A34A' : '#CA8A04',
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
            width: '100%', height: '48px', background: '#FFFFFF', color: '#1A1A1A',
            border: '1px solid #8C3225', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Add another expense
        </button>
        <button
          onClick={() => onCreateReport && onCreateReport(expenses)}
          style={{
            width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
            border: 'none', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', borderRadius: '4px',
          }}
        >
          Create expense report
        </button>
      </div>
    </div>
  )
}
