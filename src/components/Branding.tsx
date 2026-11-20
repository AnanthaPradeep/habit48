import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

export const logo = import.meta.env.BASE_URL + 'brand/logo.svg'

export function Splash() {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 1600)
    return () => clearTimeout(timer)
  }, [])
  return <div id="splash" role="status" aria-label="Loading My Routine" aria-hidden={done} className={done ? 'done' : undefined}>
    <div className="splash-inner">
      <div className="pulse-box"><img src={logo} alt="My Routine" /></div>
      <svg className="heartbeat" viewBox="0 0 180 44" aria-hidden="true">
        <path d="M0 25H48L59 15L69 30L82 3L95 41L107 25H180" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <small>Small steps. Every day.</small>
    </div>
  </div>
}

interface LoginProps {
  busy: boolean
  status: string
  login(username: string, password: string): Promise<boolean>
}
export function Login({ busy, status, login }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false)
  const passwordInput = useRef<HTMLInputElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await login(String(data.get('username')), String(data.get('password')))
  }
  return <section id="loginGate">
    <div className="login-brand"><div className="logo-tile"><img src={logo} alt="My Routine" /></div><span>YOUR PERSONAL WELLNESS JOURNAL</span></div>
    <h1>Welcome back.</h1>
    <p className="login-sub">Small steps. Every day.</p>
    <form id="loginForm" onSubmit={submit}>
      <label htmlFor="cloudUser">Username</label>
      <input id="cloudUser" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter username" required />
      <label htmlFor="cloudPassword">Password</label>
      <div className="password-wrap">
        <input ref={passwordInput} id="cloudPassword" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter password" required />
        <button type="button" id="passwordToggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
          onClick={() => { setShowPassword(value => !value); passwordInput.current?.focus() }}>
          {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      <button id="loginSubmit" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
    </form>
    <p id="loginStatus" role="status">{status}</p>
    <div className="login-footer">Private journal · Secure cloud access</div>
  </section>
}
