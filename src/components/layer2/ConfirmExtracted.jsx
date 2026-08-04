import { useState, useEffect } from 'react'
import { suggestCategory } from '../../lib/claude'
import QuestionScreen from './QuestionScreen'

const CATEGORIES = [
  'Travel Fare', 'Lodging and Boarding', 'Food', 'Bike Fare',
  'Consultant Fee', 'Professional Fee', 'Retainership / Consultancy',
  'Legal Fees', 'Courier', 'Service', 'Staff Welfare', 'Filing Fees',
  'Furniture and Fixtures', 'Housekeeping', 'Leasehold Improvements',
  'Medicine', 'Relocation Allowance', 'Repairs and Maintenance',
  'Subscription / Software', 'Learning and Development', 'Other',
]

export default function ConfirmExtracted({ layer1Data, onContinue, onBack }) {
  const [data, setData] = useState({
    amount: layer1Data?.amount ?? '',
    vendor: layer1Data?.vendor ?? '',
    date: layer1Data?.date ?? '',
    category: layer1Data?.category ?? '',
  })
  const [editingField, setEditingField] = useState(null)
  const [suggestedCategory, setSuggestedCategory] = useState(null)
  const [loadingCategory, setLoadingCategory] = useState(false)

  useEffect(() => {
    if (!layer1Data?.vendor) return
    setLoadingCategory(true)
    suggestCategory(layer1Data.vendor).then((cat) => {
      setLoadingCategory(false)
      if (cat) {
        setSuggestedCategory(cat)
        if (!data.category) setData((d) => ({ ...d, category: cat }))
      }
    })
  }, [])

  function handleEdit(field) {
    setEditingField(editingField === field ? null : field)
  }

  function handleChange(field, value) {
    setData((d) => ({ ...d, [field]: value }))
  }

  const rows = [
    { key: 'amount', label: 'Amount' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'date', label: 'Date' },
    { key: 'category', label: 'Category', isCategory: true },
  ]

  return (
    <QuestionScreen step={1} onBack={onBack} heading="We found this from your receipt">
      <div style={{ border: '1px solid #E8E8E8', borderRadius: '4px', marginBottom: '20px', overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <div key={row.key}>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', minHeight: '56px',
                background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
                borderBottom: i < rows.length - 1 ? '1px solid #E8E8E8' : 'none',
              }}
            >
              <span style={{ fontSize: '12px', color: '#6B6B6B', flexShrink: 0, marginRight: '12px' }}>
                {row.label}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, justifyContent: 'flex-end' }}>
                {editingField === row.key ? (
                  row.isCategory ? (
                    <select
                      value={data.category}
                      onChange={(e) => handleChange('category', e.target.value)}
                      style={{
                        fontSize: '13px', border: '1px solid #E8E8E8', borderRadius: '4px',
                        padding: '4px 8px', outline: 'none', background: '#FFFFFF',
                      }}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      autoFocus
                      value={data[row.key]}
                      onChange={(e) => handleChange(row.key, e.target.value)}
                      style={{
                        fontSize: '13px', border: '1px solid #E8E8E8', borderRadius: '4px',
                        padding: '4px 8px', outline: 'none', width: '140px',
                      }}
                    />
                  )
                ) : (
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1A1A1A', textAlign: 'right' }}>
                    {row.isCategory ? (
                      <span>
                        {data.category || '—'}
                        {suggestedCategory && data.category === suggestedCategory && (
                          <span style={{ fontSize: '11px', color: '#6B6B6B', fontWeight: 400, marginLeft: '6px' }}>
                            (suggested)
                          </span>
                        )}
                        {loadingCategory && !suggestedCategory && (
                          <span style={{ fontSize: '11px', color: '#6B6B6B', fontWeight: 400, marginLeft: '6px' }}>
                            Detecting category...
                          </span>
                        )}
                      </span>
                    ) : (
                      data[row.key] || '—'
                    )}
                  </span>
                )}
                <button
                  onClick={() => handleEdit(row.key)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '13px', color: '#4A4A4A', padding: 0, flexShrink: 0,
                  }}
                >
                  {editingField === row.key ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>
            {row.isCategory && suggestedCategory && editingField !== 'category' && (
              <div style={{
                padding: '4px 16px 8px',
                background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
                borderBottom: '1px solid #E8E8E8',
              }}>
                <span style={{ fontSize: '11px', color: '#6B6B6B' }}>Based on vendor name</span>
              </div>
            )}
            {row.isCategory && !data.category && !loadingCategory && editingField !== 'category' && (
              <div style={{
                padding: '4px 16px 8px',
                background: i % 2 === 0 ? '#FFFFFF' : '#F7F7F7',
                borderBottom: '1px solid #E8E8E8',
              }}>
                <select
                  value={data.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  style={{
                    fontSize: '13px', border: '1px solid #E8E8E8', borderRadius: '4px',
                    padding: '4px 8px', outline: 'none', background: '#FFFFFF', width: '100%',
                  }}
                >
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => onContinue(data)}
        style={{
          width: '100%', height: '48px', background: '#8C3225', color: '#FFFFFF',
          border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
        }}
      >
        Looks correct, continue
      </button>
    </QuestionScreen>
  )
}
