import { useEffect, useRef, useState } from 'react'
import { submitCode, pollResult } from '../api.js'

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 60000
const BUSY_RETRY_DELAY_MS = 3000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function useBotRun(challengeId, starterCode) {
  const [code, setCode] = useState(starterCode)
  const [state, setState] = useState('idle')
  const [logs, setLogs] = useState([])
  const [subId, setSubId] = useState(null)
  const [error, setError] = useState(null)
  const pollHandle = useRef(null)

  useEffect(() => () => clearTimeout(pollHandle.current), [])

  async function run() {
    clearTimeout(pollHandle.current)
    setError(null)
    setLogs([])
    setSubId(null)
    setState('pending')

    let submissionId
    try {
      let res
      try {
        res = await submitCode(challengeId, code)
      } catch (e) {
        if (e.status !== 503) throw e
        await sleep(BUSY_RETRY_DELAY_MS)
        res = await submitCode(challengeId, code)
      }
      submissionId = res.id
      setSubId(submissionId)
    } catch (e) {
      setState('error')
      setError(e.message)
      return
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS
    const tick = async () => {
      try {
        const res = await pollResult(submissionId)
        if (res.status === 'pending') {
          if (Date.now() > deadline) {
            setState('timeout')
            return
          }
          pollHandle.current = setTimeout(tick, POLL_INTERVAL_MS)
          return
        }
        setLogs(res.logs || [])
        setState(res.status)
      } catch (e) {
        setState('error')
        setError(e.message)
      }
    }
    pollHandle.current = setTimeout(tick, POLL_INTERVAL_MS)
  }

  return { code, setCode, run, state, logs, subId, error }
}
