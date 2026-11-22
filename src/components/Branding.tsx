import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

type BrandTheme = 'light' | 'dark'
function BrandSymbol({ theme, width, pulse = false }: { theme: BrandTheme; width: number; pulse?: boolean }) {
  const variant = theme === 'dark' ? 'violet' : 'rose'
  return <span className={pulse ? 'brand-symbol pulse-box' : 'brand-symbol'}>
    <img key={variant} src={`${import.meta.env.BASE_URL}brand/icons/icon-512-mr-${variant}-v1.png`}
      width={width} height={width} alt="" />
  </span>
}

function BrandWordmark() {
  return <span className="brand-wordmark" aria-hidden="true">My-Routine</span>
}

export function BrandLockup({ theme, stacked = false, tagline = false, decorative = false }: {
  theme: BrandTheme; stacked?: boolean; tagline?: boolean; decorative?: boolean
}) {
  return <span className={'brand-lockup' + (stacked ? ' brand-lockup-stacked' : '') + (' brand-lockup-' + theme)}
    role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : tagline ? 'My-Routine, Daily Balance' : 'My-Routine'}>
    <BrandSymbol theme={theme} width={stacked ? 118 : 48} />
    <span className="brand-lockup-copy" aria-hidden="true"><BrandWordmark />
      {tagline && <small className="brand-lockup-tagline">Daily Balance</small>}
    </span>
  </span>
}

export function Splash({ theme }: { theme: BrandTheme }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 1600)
    return () => clearTimeout(timer)
  }, [])
  return <div id="splash" role="status" aria-label="Loading My Routine" aria-hidden={done} className={done ? 'done' : undefined}>
    <div className="splash-inner">
      <BrandSymbol theme={theme} width={128} pulse />
      <BrandWordmark />
      <small className="splash-tagline">Daily Balance</small>
      <svg className="heartbeat" viewBox="0 0 180 44" aria-hidden="true">
        <path d="M0 25H48L59 15L69 30L82 3L95 41L107 25H180" fill="none" stroke="currentColor"
          strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  </div>
}

interface LoginProps {
  theme: BrandTheme
  busy: boolean
  status: string
  login(username: string, password: string): Promise<boolean>
}
export function Login({ busy, status, login, theme }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false)
  const passwordInput = useRef<HTMLInputElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await login(String(data.get('username')), String(data.get('password')))
  }
  return <section id="loginGate">
    <div className="login-brand"><BrandLockup theme={theme} stacked tagline /></div>
    <h1>Welcome back.</h1>
    <p className="login-sub">Small steps. Every day.</p>
    <form id="loginForm" onSubmit={submit}>
      <label htmlFor="cloudUser">Email address</label>
      <input id="cloudUser" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} inputMode="email" placeholder="Enter your email address" required />
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
