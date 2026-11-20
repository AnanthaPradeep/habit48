import { useEffect, useLayoutEffect, useState } from 'react'
import { keys } from '../domain/journal'

type Theme = 'light' | 'dark'
const query = '(prefers-color-scheme: dark)'
function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(keys.theme)
    return value === 'dark' || value === 'light' ? value : null
  } catch { return null }
}
export function useTheme() {
  const [preference, setPreference] = useState(storedTheme)
  const [systemDark, setSystemDark] = useState(() => matchMedia(query).matches)
  const theme = preference ?? (systemDark ? 'dark' : 'light')
  useEffect(() => {
    const media = matchMedia(query)
    const update = () => setSystemDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = theme === 'dark' ? '#15241d' : '#174B37'
  }, [theme])
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setPreference(next)
    try { localStorage.setItem(keys.theme, next) } catch { /* Theme remains active for this tab. */ }
  }
  return { theme, toggle }
}
