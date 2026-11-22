import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const media = {
  morning: 'Morning light on an open journal and a ceramic cup',
  breakfast: 'A breakfast bowl and fruit',
  lunch: 'A bowl of dal, rice and greens',
  snack: 'Guava and roasted nuts',
  dinner: 'A plate of vegetables and legumes',
  training: 'Two dumbbells and a rolled mat in a home training space',
  walking: 'Sunlight on a shaded walking path',
  sleep: 'Folded linen and a warm bedside lamp',
  mobility: 'A rolled exercise mat and a towel in soft daylight',
  hydration: 'A glass carafe and a pale green drinking glass',
} as const
export type Asset = keyof typeof media
export const mediaRegistry = Object.fromEntries(Object.entries(media).map(([key, alt]) => [key, {
  path: import.meta.env.BASE_URL + 'editorial/' + key + '.webp',
  type: 'image/webp', alt, source: 'Original OpenAI-generated editorial photograph for My Routine',
  license: 'Project-generated asset. No third-party attribution required.', fallback: 'Themed surface',
}])) as Record<Asset, { path: string; alt: string; type: string; source: string; license: string; fallback: string }>

export function EditorialImage({ asset, eager = false, decorative = false }: { asset: Asset; eager?: boolean; decorative?: boolean }) {
  const [missing, setMissing] = useState(false)
  const item = mediaRegistry[asset]
  return <span className="editorial-image">{!missing && <img src={item.path} alt={decorative ? '' : item.alt}
    width="502" height="502" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setMissing(true)} />}</span>
}
export function EditorialHero({ asset, children, className = '' }: { asset: Asset; children: ReactNode; className?: string }) {
  return <section className={'editorial-hero ' + className}><EditorialImage asset={asset} eager decorative />
    <div className="editorial-hero-copy">{children}</div></section>
}
export function RouteSkeleton({ label }: { label: string }) {
  return <div className="panel route-skeleton" role="status">Loading {label}…<span aria-hidden="true" /><span aria-hidden="true" /></div>
}
export function MediaRail({ label, items }: { label: string; items: { id: string; content: ReactNode }[] }) {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  function position(node: HTMLDivElement, item: Element) {
    return Math.max(0, Math.min(node.scrollWidth - node.clientWidth,
      Math.round(node.scrollLeft + item.getBoundingClientRect().left - node.getBoundingClientRect().left)))
  }
  function go(index: number) {
    const node = track.current
    const item = node?.children[index]
    if (!node || !item) return
    setActive(index)
    node.scrollTo({ left: position(node, item), behavior: 'instant' })
  }
  return <section className="panel media-rail" aria-label={label}>
    <div className="section-heading"><h2>{label}</h2><div className="calendar-actions">
      <button type="button" className="icon-button" aria-label={'Previous ' + label.toLowerCase()} disabled={active === 0} onClick={() => go(active - 1)}><ChevronLeft /></button>
      <button type="button" className="icon-button" aria-label={'Next ' + label.toLowerCase()} disabled={active === items.length - 1} onClick={() => go(active + 1)}><ChevronRight /></button>
    </div></div>
    <div ref={track} className="media-rail-track" role="group" aria-label={label + ' cards'} tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          go(Math.min(items.length - 1, Math.max(0, active + (event.key === 'ArrowRight' ? 1 : -1))))
        }
      }} onScroll={() => {
        const node = track.current
        if (!node) return
        const distances = [...node.children].map(item => Math.abs(position(node, item) - node.scrollLeft))
        setActive(distances.indexOf(Math.min(...distances)))
      }}>
      {items.map(item => <article key={item.id} className="media-rail-card">{item.content}</article>)}
    </div>
    <div className="media-dots" aria-label={label + ' position'}>
      {items.map((item, index) => <button key={item.id} type="button" aria-label={'Show card ' + (index + 1)} aria-current={index === active ? 'true' : undefined} onClick={() => go(index)}><span /></button>)}
    </div>
  </section>
}
