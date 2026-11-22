import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export function Modal({ title, close, children, className = '' }: { title: string; close(): void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={'routine-dialog ' + className} aria-label={title} onCancel={event => {
    event.preventDefault()
    close()
  }}>
    <div className="section-heading"><h2>{title}</h2>
      <button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><X aria-hidden="true" /></button>
    </div>
    {children}
  </dialog>
}

export function Pagination({ page, total, size, change, label }: {
  page: number; total: number; size: number; change(page: number): void; label: string
}) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (pages === 1) return null
  return <nav className="list-pagination" aria-label={label}>
    <button type="button" className="icon-button" aria-label="Previous page" disabled={page === 0} onClick={() => change(page - 1)}>
      <ChevronLeft aria-hidden="true" /></button>
    <span role="status">Page {page + 1} of {pages} · {total} results</span>
    <button type="button" className="icon-button" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => change(page + 1)}>
      <ChevronRight aria-hidden="true" /></button>
  </nav>
}
