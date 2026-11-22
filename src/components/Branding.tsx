import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

type BrandTheme = 'light' | 'dark'
type LogoLayout = 'stacked' | 'horizontal' | 'symbol' | 'wordmark'
const proportions = { stacked: [900, 850], horizontal: [1260, 420], symbol: [512, 512], wordmark: [900, 240] } as const

export function BrandLogo({ theme, layout, width, decorative = false, className }: {
  theme: BrandTheme; layout: LogoLayout; width: number; decorative?: boolean; className?: string
}) {
  const [w, h] = proportions[layout]
  const alt = decorative ? '' : layout === 'symbol' || layout === 'wordmark' ? 'My Routine' : 'My Routine · Daily Balance'
  return <img key={theme} className={className} src={import.meta.env.BASE_URL + 'brand/logos/' + theme + '/' + layout + '-luminous-v1.svg'}
    width={width} height={Math.round(width * h / w)} alt={alt} />
}

export function Splash({ theme }: { theme: BrandTheme }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 1600)
    return () => clearTimeout(timer)
  }, [])
  return <div id="splash" role="status" aria-label="Loading My Routine" aria-hidden={done} className={done ? 'done' : undefined}>
    <div className="splash-inner">
      <div className="pulse-box"><BrandLogo theme={theme} layout="symbol" width={128} decorative /></div>
      <BrandLogo className="splash-wordmark" theme={theme} layout="wordmark" width={206} />
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
    <div className="login-brand"><BrandLogo theme={theme} layout="stacked" width={194} /></div>
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
