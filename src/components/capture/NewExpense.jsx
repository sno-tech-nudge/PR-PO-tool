import { useState, useEffect, useRef } from 'react'
import Step1Receipt from './Step1Receipt'
import Step2Payment from './Step2Payment'
import CrossValidation from './CrossValidation'
import ConfirmationScreen from './ConfirmationScreen'
import BulkAddExpenses from '../layer2/BulkAddExpenses'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { supabase } from '../../lib/supabase'
import { saveToQueue, getUnsynced, markSynced } from '../../lib/offlineQueue'
import { detectUPI } from '../../lib/claude'

const STEPS = {
  STEP1: 'step1',
  STEP2: 'step2',
  UPI_PROMPT: 'upi_prompt',
  CROSS_VALIDATION: 'cross_validation',
  CONFIRMATION: 'confirmation',
}

export default function NewExpense({ user, onContinueToDetails, onBack }) {
  const [activeTab, setActiveTab] = useState('single')
  const [step, setStep] = useState(STEPS.STEP1)
  const [receiptData, setReceiptData] = useState(null)
  const [paymentData, setPaymentData] = useState(null)
  const [matchedAmount, setMatchedAmount] = useState(null)
  const [singleDocument, setSingleDocument] = useState(false)
  const [capturedOffline, setCapturedOffline] = useState(false)
  const [syncNotification, setSyncNotification] = useState(false)
  const captureIdRef = useRef(null)
  const { isOnline } = useNetworkStatus()

  useEffect(() => {
    if (!isOnline) return
    async function syncPending() {
      const records = await getUnsynced()
      if (records.length === 0) return
      for (const record of records) {
        try {
          const ts = Date.now()
          const receiptPath = `captures/${ts}-receipt.jpg`
          const paymentPath = `captures/${ts}-payment.jpg`
          if (record.receipt_base64) {
            const blob = base64ToBlob(record.receipt_base64, 'image/jpeg')
            await supabase.storage.from('expense-documents').upload(receiptPath, blob)
          }
          if (record.payment_base64) {
            const blob = base64ToBlob(record.payment_base64, 'image/jpeg')
            await supabase.storage.from('expense-documents').upload(paymentPath, blob)
          }
          await markSynced(record.id)
        } catch (err) {
          console.error('Failed to sync offline capture:', err)
        }
      }
      setSyncNotification(true)
      setTimeout(() => setSyncNotification(false), 3000)
    }
    syncPending()
  }, [isOnline])

  function base64ToBlob(base64, mimeType) {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type: mimeType })
  }

  async function handleStep1Complete(data) {
    setReceiptData(data)

    // Check if Step 1 document is already a complete UPI screenshot
    // If so, skip Step 2 entirely — it already has all the info we need
    if (data?.base64) {
      try {
        const upi = await detectUPI(data.base64)
        if (upi?.is_upi && upi?.has_vendor_info) {
          const syntheticPayment = { base64: data.base64, paymentType: 'upi', upiData: upi }
          setPaymentData(syntheticPayment)
          setSingleDocument(true)
          await saveOrUpload(syntheticPayment, null, true)
          setStep(STEPS.CONFIRMATION)
          return
        }
      } catch {
        // If detection fails, continue to Step 2 normally
      }
    }

    setStep(STEPS.STEP2)
  }

  async function handleStep2Complete(data) {
    setPaymentData(data)
    const upiData = data.upiData

    if (data.paymentType === 'cash') {
      await saveOrUpload(data, null, false)
      setStep(STEPS.CONFIRMATION)
      return
    }

    if (upiData?.is_upi && upiData?.has_vendor_info) {
      // UPI screenshot already has all details — auto treat as single document, no prompt needed
      setSingleDocument(true)
      await saveOrUpload(data, null, true)
      setStep(STEPS.CONFIRMATION)
      return
    }

    setStep(STEPS.CROSS_VALIDATION)
  }

  async function handleUpiSingleDoc() {
    setSingleDocument(true)
    await saveOrUpload(paymentData, null, true)
    setStep(STEPS.CONFIRMATION)
  }

  function handleUpiKeepBoth() {
    setStep(STEPS.CROSS_VALIDATION)
  }

  async function handleValidationConfirm({ matchedAmount: amt, amountsMatch }) {
    setMatchedAmount(amt)
    await saveOrUpload(paymentData, { matchedAmount: amt, amountsMatch }, false)
    setStep(STEPS.CONFIRMATION)
  }

  async function saveOrUpload(pData, validationResult, isSingle) {
    const offline = !isOnline
    setCapturedOffline(offline)

    if (offline) {
      await saveToQueue({
        id: crypto.randomUUID(),
        receipt_base64: receiptData?.base64 ?? null,
        payment_base64: pData?.base64 ?? null,
        receipt_type: 'receipt',
        payment_type: pData?.paymentType ?? null,
        captured_at: new Date().toISOString(),
        synced: false,
      })
      return
    }

    try {
      const ts = Date.now()
      let receiptPath = null
      let paymentPath = null

      if (receiptData?.base64) {
        receiptPath = `captures/${ts}-receipt.jpg`
        const blob = base64ToBlob(receiptData.base64, 'image/jpeg')
        const { error } = await supabase.storage.from('expense-documents').upload(receiptPath, blob)
        if (error) throw error
      }

      if (pData?.base64) {
        paymentPath = `captures/${ts}-payment.jpg`
        const blob = base64ToBlob(pData.base64, 'image/jpeg')
        const { error } = await supabase.storage.from('expense-documents').upload(paymentPath, blob)
        if (error) throw error
      }

      const { data: captureRow } = await supabase.from('expense_captures').insert({
        receipt_storage_path: receiptPath,
        payment_storage_path: paymentPath,
        receipt_extracted_amount: receiptData?.extracted?.amount ?? null,
        receipt_extracted_vendor: receiptData?.extracted?.vendor ?? null,
        receipt_extracted_date: receiptData?.extracted?.date ?? null,
        payment_extracted_amount: pData?.upiData?.amount ?? null,
        payment_extracted_transaction_id: pData?.upiData?.transaction_id ?? null,
        payment_is_upi: pData?.upiData?.is_upi ?? false,
        payment_app: pData?.upiData?.payment_app ?? null,
        amounts_match: validationResult?.amountsMatch ?? null,
        quality_override: receiptData?.qualityOverride ?? false,
        captured_offline: false,
        single_document: isSingle,
        status: 'captured',
      }).select('id').single()
      captureIdRef.current = captureRow?.id ?? null
    } catch {
      await saveToQueue({
        id: crypto.randomUUID(),
        receipt_base64: receiptData?.base64 ?? null,
        payment_base64: pData?.base64 ?? null,
        receipt_type: 'receipt',
        payment_type: pData?.paymentType ?? null,
        captured_at: new Date().toISOString(),
        synced: false,
      })
      setCapturedOffline(true)
    }
  }

  // The tab switcher only makes sense before any capture progress has been
  // made — once you're mid-flow (payment step, cross-validation, etc.) the
  // tabs disappear so switching can't discard in-progress work.
  const showTabs = step === STEPS.STEP1

  if (activeTab === 'bulk') {
    return <BulkAddExpenses user={user} onSaved={onBack} onBack={() => setActiveTab('single')} />
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px', width: '100%' }}>
      {syncNotification && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
          background: '#8C3225', color: '#FFFFFF', fontSize: '13px',
          padding: '10px 20px', borderRadius: '4px', zIndex: 60,
        }}>
          Your saved documents have been uploaded
        </div>
      )}

      {showTabs && (
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E8E8', marginBottom: '20px' }}>
          {[['single', 'Add Expense'], ['bulk', 'Bulk Add Expenses']].map(([key, label]) => (
            <div
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '10px 16px', fontSize: '13px', cursor: 'pointer',
                fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? '#1A1A1A' : '#6B6B6B',
                borderBottom: activeTab === key ? '2px solid #8C3225' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      )}

      {step === STEPS.STEP1 && (
        <Step1Receipt onComplete={handleStep1Complete} />
      )}

      {step === STEPS.STEP2 && (
        <Step2Payment
          receiptExtracted={receiptData?.extracted}
          onComplete={handleStep2Complete}
          onBack={() => setStep(STEPS.STEP1)}
        />
      )}

      {step === STEPS.UPI_PROMPT && (
        <div>
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: '20px',
          }}>
            <div style={{ background: '#FFFFFF', padding: '24px', maxWidth: '360px', width: '100%', borderRadius: '4px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: '#1A1A1A', marginBottom: '8px' }}>
                This could work as both documents
              </div>
              <div style={{ fontSize: '13px', color: '#4A4A4A', marginBottom: '20px' }}>
                This UPI screenshot contains vendor information. You may not need a separate receipt.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={handleUpiSingleDoc}
                  style={{
                    width: '100%', height: '44px', background: '#8C3225', color: '#FFFFFF',
                    border: 'none', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
                  }}
                >
                  Use as single document
                </button>
                <button
                  onClick={handleUpiKeepBoth}
                  style={{
                    width: '100%', height: '44px', border: '1px solid #E8E8E8', background: '#FFFFFF',
                    color: '#1A1A1A', fontSize: '14px', fontWeight: 500, cursor: 'pointer', borderRadius: '4px',
                  }}
                >
                  Keep both documents
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === STEPS.CROSS_VALIDATION && (
        <CrossValidation
          receiptExtracted={receiptData?.extracted}
          paymentData={paymentData}
          onConfirm={handleValidationConfirm}
          onRetakeReceipt={() => setStep(STEPS.STEP1)}
          onRetakePayment={() => setStep(STEPS.STEP2)}
        />
      )}

      {step === STEPS.CONFIRMATION && (
        <ConfirmationScreen
          receiptExtracted={receiptData?.extracted}
          paymentData={paymentData}
          matchedAmount={matchedAmount}
          singleDocument={singleDocument}
          capturedOffline={capturedOffline}
          onContinue={(data) => onContinueToDetails({ ...data, capture_id: captureIdRef.current })}
        />
      )}
    </div>
  )
}
