import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import {
  DEFAULT_LEDGER_MAP, DEFAULT_BANK_LEDGER,
  buildJournalEntries, generateTallyXML, generateTallyCSV, downloadFile,
} from '../../lib/tallyExport'

const STORAGE_KEY = 'nudge_tally_config'

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (err) {
    console.error(err)
  }
  return { ledgerMap: { ...DEFAULT_LEDGER_MAP }, bankLedger: DEFAULT_BANK_LEDGER, companyName: '' }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

export default function TallyExportView() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [config, setConfig] = useState(loadConfig)
  const [showConfig, setShowConfig] = useState(false)
  const [preview, setPreview] = useState(null) // report being previewed
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('expense_reports')
      .select(`
        id, report_reference, status, brand, total_amount, expense_count,
        created_at, approved_at, reimbursed_at,
        report_expenses (
          expense_details (
            id, vendor, category, amount, date, invoice_number, gstin
          )
        )
      `)
      .in('status', ['reimbursed', 'approved'])
      .order('reimbursed_at', { ascending: false })
    setReports(data || [])
    setLoading(false)
  }

  function updateConfig(patch) {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(next)
  }

  function updateLedger(cat, val) {
    const next = { ...config, ledgerMap: { ...config.ledgerMap, [cat]: val } }
    setConfig(next)
    saveConfig(next)
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === reports.length ? new Set() : new Set(reports.map(r => r.id)))
  }

  const toExport = selected.size > 0
    ? reports.filter(r => selected.has(r.id))
    : reports

  function handleDownloadXML() {
    setExporting(true)
    const xml = generateTallyXML(toExport, config.ledgerMap, config.bankLedger, config.companyName)
    const date = new Date().toISOString().slice(0, 10)
    downloadFile(xml, `tally-vouchers-${date}.xml`, 'application/xml')
    setExporting(false)
    setExported(true)
    setTimeout(() => setExported(false), 3000)
  }

  function handleDownloadCSV() {
    setExporting(true)
    const csv = generateTallyCSV(toExport, config.ledgerMap, config.bankLedger)
    const date = new Date().toISOString().slice(0, 10)
    downloadFile('﻿' + csv, `tally-journal-${date}.csv`, 'text/csv;charset=utf-8')
    setExporting(false)
    setExported(true)
    setTimeout(() => setExported(false), 3000)
  }

  const previewEntries = preview ? buildJournalEntries(preview, config.ledgerMap, config.bankLedger) : null

  return (
    <div>
      {/* ── Header row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>Tally Export</div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
            Generate payment vouchers for direct import into TallyPrime / Tally ERP 9
          </div>
        </div>
        <button
          onClick={() => setShowConfig(s => !s)}
          style={{
            height: '34px', padding: '0 14px', borderRadius: '6px',
            background: showConfig ? '#111827' : '#FFFFFF',
            color: showConfig ? '#FFFFFF' : '#374151',
            border: '1px solid #E5E7EB', fontSize: '12px', cursor: 'pointer',
          }}
        >
          Ledger Settings
        </button>
      </div>

      {/* ── Ledger config panel ── */}
      {showConfig && (
        <div style={{
          border: '1px solid #E5E7EB', borderRadius: '10px',
          padding: '18px', marginBottom: '20px', background: '#F9FAFB',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '14px' }}>
            Ledger Mapping — Category → Your Tally Ledger Name
          </div>

          {/* Company name */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: '4px' }}>
              TALLY COMPANY NAME (optional)
            </label>
            <input
              value={config.companyName}
              onChange={e => updateConfig({ companyName: e.target.value })}
              placeholder="e.g. The Nudge Institute"
              style={inputStyle}
            />
          </div>

          {/* Bank ledger */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: '4px' }}>
              CREDIT ACCOUNT (bank / employee payable)
            </label>
            <input
              value={config.bankLedger}
              onChange={e => updateConfig({ bankLedger: e.target.value })}
              placeholder="e.g. HDFC Bank Current Account"
              style={inputStyle}
            />
          </div>

          {/* Category → ledger map */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }}>
            {Object.keys(DEFAULT_LEDGER_MAP).map(cat => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  fontSize: '11px', color: '#374151', width: '160px', flexShrink: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cat}
                </div>
                <span style={{ color: '#9CA3AF', fontSize: '11px' }}>→</span>
                <input
                  value={config.ledgerMap[cat] || ''}
                  onChange={e => updateLedger(cat, e.target.value)}
                  placeholder={DEFAULT_LEDGER_MAP[cat]}
                  style={{ ...inputStyle, flex: 1, height: '32px', fontSize: '12px' }}
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: '12px', fontSize: '11px', color: '#9CA3AF' }}>
            Note: Ledger names must match exactly what is set up in your Tally company. Settings are saved in your browser.
          </div>
        </div>
      )}

      {/* ── How to import guide ── */}
      <div style={{
        background: '#fdf0ed', border: '1px solid #BFDBFE',
        borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#8C3225', marginBottom: '4px' }}>
            How to import into TallyPrime
          </div>
          <div style={{ fontSize: '11px', color: '#1E40AF', lineHeight: 1.6 }}>
            1. Download the XML file below · 2. Open TallyPrime → Gateway of Tally · 3. Go to <b>Import → Data</b> · 4. Select the downloaded XML · 5. Vouchers will be created automatically
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ padding: '20px 0' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: '60px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '8px' }} />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && reports.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', color: '#D1D5DB', fontWeight: 300 }}>—</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '4px' }}>No reimbursed reports yet</div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Tally entries will appear here once reports are approved or reimbursed</div>
        </div>
      )}

      {/* ── Report list + export bar ── */}
      {!loading && reports.length > 0 && (
        <>
          {/* Select all + export actions */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                onClick={toggleAll}
                style={{ fontSize: '12px', color: '#111827', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {selected.size === reports.length ? 'Deselect all' : 'Select all'}
              </span>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>
                {selected.size > 0 ? `${selected.size} selected` : `${reports.length} report${reports.length !== 1 ? 's' : ''}`}
              </span>
              {exported && (
                <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 500 }}>✓ Downloaded</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDownloadCSV}
                disabled={exporting}
                style={{
                  height: '34px', padding: '0 14px', borderRadius: '6px',
                  background: '#FFFFFF', color: '#374151',
                  border: '1px solid #E5E7EB', fontSize: '12px', cursor: 'pointer',
                }}
              >
                ↓ CSV {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
              <button
                onClick={handleDownloadXML}
                disabled={exporting}
                style={{
                  height: '34px', padding: '0 16px', borderRadius: '6px',
                  background: '#8C3225', color: '#FFFFFF',
                  border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                ↓ Tally XML {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            </div>
          </div>

          {/* Report rows */}
          {reports.map(report => {
            const isSelected = selected.has(report.id)
            const isPreviewed = preview?.id === report.id
            const expenses = (report.report_expenses || []).map(re => re.expense_details).filter(Boolean)
            const cats = [...new Set(expenses.map(e => e.category).filter(Boolean))]
            const date = report.reimbursed_at || report.approved_at

            return (
              <div key={report.id} style={{
                border: `1px solid ${isSelected ? '#111827' : '#E5E7EB'}`,
                borderRadius: '8px', marginBottom: '8px', overflow: 'hidden',
                background: isSelected ? '#F9FAFB' : '#FFFFFF',
              }}>
                <div style={{ display: 'flex' }}>
                  {/* Checkbox */}
                  <div
                    onClick={() => toggleSelect(report.id)}
                    style={{
                      width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRight: '1px solid #F3F4F6', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: '16px', height: '16px',
                      border: `1.5px solid ${isSelected ? '#111827' : '#D1D5DB'}`,
                      borderRadius: '3px', background: isSelected ? '#111827' : '#FFFFFF',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', fontFamily: 'monospace' }}>
                          {report.report_reference}
                        </span>
                        <span style={{
                          marginLeft: '8px', fontSize: '10px', fontWeight: 500, padding: '2px 6px',
                          borderRadius: '4px',
                          background: report.status === 'reimbursed' ? '#F0FDF4' : '#FFFBEB',
                          color: report.status === 'reimbursed' ? '#15803D' : '#B45309',
                        }}>
                          {report.status === 'reimbursed' ? 'Reimbursed' : 'Approved'}
                        </span>
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                        ₹{Number(report.total_amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '6px' }}>
                      {report.brand && <span>{report.brand} · </span>}
                      {date ? new Date(date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                      {cats.length > 0 && <span> · {cats.slice(0,3).join(', ')}{cats.length > 3 ? ` +${cats.length-3}` : ''}</span>}
                    </div>

                    {/* Preview button */}
                    <button
                      onClick={() => setPreview(prev => prev?.id === report.id ? null : report)}
                      style={{
                        height: '26px', padding: '0 10px', borderRadius: '4px',
                        background: 'transparent', color: '#6B7280',
                        border: '1px solid #E5E7EB', fontSize: '11px', cursor: 'pointer',
                      }}
                    >
                      {isPreviewed ? '▲ Hide journal' : '▼ Preview journal entries'}
                    </button>
                  </div>
                </div>

                {/* Journal entries preview */}
                {isPreviewed && previewEntries && (
                  <div style={{ borderTop: '1px solid #F3F4F6', background: '#F9FAFB', padding: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Journal Entry — {previewEntries.displayDate} · Voucher: Payment
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                            {['Dr/Cr', 'Ledger Account', 'Category / Note', 'Amount'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewEntries.debits.map((d, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ fontWeight: 600, color: '#8C3225', background: '#fdf0ed', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>Dr</span>
                              </td>
                              <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 500 }}>{d.ledger}</td>
                              <td style={{ padding: '8px 10px', color: '#6B7280' }}>{d.category}{d.vendors ? ` — ${d.vendors}` : ''}</td>
                              <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 600, textAlign: 'right', fontFamily: 'monospace' }}>
                                ₹{Number(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          {previewEntries.credits.map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: '#FFF' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ fontWeight: 600, color: '#B91C1C', background: '#FEF2F2', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>Cr</span>
                              </td>
                              <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 500 }}>{c.ledger}</td>
                              <td style={{ padding: '8px 10px', color: '#6B7280' }}>Reimbursement payment</td>
                              <td style={{ padding: '8px 10px', color: '#111827', fontWeight: 600, textAlign: 'right', fontFamily: 'monospace' }}>
                                ₹{Number(c.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                          {/* Totals row */}
                          <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                            <td colSpan={3} style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 600, color: '#374151' }}>Total</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', color: '#111827' }}>
                              ₹{Number(previewEntries.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Narration */}
                    <div style={{ marginTop: '10px', fontSize: '11px', color: '#6B7280' }}>
                      <span style={{ fontWeight: 500 }}>Narration: </span>{previewEntries.narration}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%', height: '36px', border: '1px solid #E5E7EB', borderRadius: '6px',
  padding: '0 10px', fontSize: '12px', color: '#111827', outline: 'none',
  background: '#FFFFFF', boxSizing: 'border-box', fontFamily: 'inherit',
}
