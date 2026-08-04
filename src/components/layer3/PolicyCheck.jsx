import { useState, useEffect } from 'react'
import { runAllChecks } from '../../lib/policyEngine'
import PolicyLoading from './PolicyLoading'
import PolicyResult from './PolicyResult'
import SubmittedScreen from './SubmittedScreen'

export default function PolicyCheck({ expenses, onAddAnother, onProceedToReport, onBack }) {
  const [phase, setPhase] = useState('loading') // 'loading' | 'result' | 'submitted'
  const [results, setResults] = useState([])
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    if (!expenses || expenses.length === 0) {
      setResults([])
      setPhase('result')
      return
    }

    async function runChecks() {
      const allResults = await Promise.all(
        expenses.map(exp => runAllChecks(exp, expenses))
      )
      setResults(allResults)
      setPhase('result')
    }

    runChecks()
  }, [])

  if (phase === 'loading') {
    return <PolicyLoading />
  }

  if (phase === 'result') {
    return (
      <PolicyResult
        results={results}
        expenses={expenses}
        onSubmitted={(sub) => {
          setSubmission(sub)
          setPhase('submitted')
        }}
        onProceedToReport={onProceedToReport
          ? ({ expenses: exps, results: res }) => onProceedToReport({ expenses: exps, results: res })
          : null
        }
        onBack={onBack}
      />
    )
  }

  if (phase === 'submitted') {
    return (
      <SubmittedScreen
        submission={submission}
        onAddAnother={onAddAnother}
      />
    )
  }

  return null
}
