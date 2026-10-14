import { useEffect, useRef, useState } from 'react'
import { registerAccount, signIn } from '../api/client.js'

export default function AuthDialog({ initialMode = 'login', onClose, onAuthenticated }) {
  const dialogRef = useRef(null)
  const [mode, setMode] = useState(initialMode)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [values, setValues] = useState({ name: '', email: '', mobile: '', password: '' })

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setError('')
    try {
      if (mode === 'register') {
        await registerAccount(values)
        setMode('login')
        setNotice('Account created. Sign in to continue.')
        setValues((current) => ({ ...current, password: '' }))
      } else {
        const user = await signIn({ email: values.email, password: values.password })
        onAuthenticated(user)
      }
    } catch (requestError) {
      const fieldErrors = requestError.details ? Object.values(requestError.details).join(' ') : ''
      setError(fieldErrors || requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog className="auth-dialog" ref={dialogRef} aria-labelledby="auth-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className="dialog-heading">
        <div>
          <span className="section-kicker">PASSENGER ACCOUNT</span>
          <h2 id="auth-title">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
        </div>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close sign in dialog">×</button>
      </div>
      {notice && <p className="dialog-success" role="status">{notice}</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <form className="dialog-form" onSubmit={submit}>
        {mode === 'register' && <>
          <label>Full name<input autoComplete="name" value={values.name} onChange={(event) => update('name', event.target.value)} required minLength={2} maxLength={120} /></label>
          <label>Mobile number<input type="tel" autoComplete="tel" value={values.mobile} onChange={(event) => update('mobile', event.target.value)} required /></label>
        </>}
        <label>Email address<input type="email" autoComplete="email" value={values.email} onChange={(event) => update('email', event.target.value)} required maxLength={254} /></label>
        <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={values.password} onChange={(event) => update('password', event.target.value)} required minLength={mode === 'register' ? 10 : 1} maxLength={72} /></label>
        {mode === 'register' && <small className="field-help">Use at least 10 characters. Passwords are hashed by the service.</small>}
        <button className="button button-search dialog-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="dialog-switch">
        {mode === 'register' ? 'Already registered?' : 'New to this project?'}{' '}
        <button type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); setNotice('') }}>
          {mode === 'register' ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </dialog>
  )
}
