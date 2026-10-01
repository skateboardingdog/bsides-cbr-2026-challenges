export async function submitCode(challenge, code) {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge, code }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `submit failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.json()
}

export async function pollResult(id) {
  const res = await fetch(`/api/result/${id}`)
  if (!res.ok) throw new Error(`poll failed (${res.status})`)
  return res.json()
}
