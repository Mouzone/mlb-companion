import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { STAT_GLOSSARY } from './statGlossary'

export function StatsGuide(): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const titleId = useId()

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (normalizedQuery === '') return STAT_GLOSSARY
    return STAT_GLOSSARY.filter((entry) =>
      `${entry.term} ${entry.name} ${entry.description}`.toLocaleLowerCase().includes(normalizedQuery),
    )
  }, [query])

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    searchRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        return
      }
      if (event.key !== 'Tab') return

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')
      if (focusable === undefined || focusable.length === 0) return
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [isOpen])

  const close = () => setIsOpen(false)

  return (
    <>
      <button
        ref={triggerRef}
        className="stats-guide-trigger"
        type="button"
        aria-label="Open stats guide"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="7" r="1" fill="currentColor" />
          <path d="M12 11v7" fill="none" />
        </svg>
      </button>

      {isOpen ? (
        <div className="stats-guide-layer">
          <button
            className="stats-guide-scrim"
            type="button"
            aria-label="Close stats guide"
            tabIndex={-1}
            onClick={close}
          />
          <aside
            ref={drawerRef}
            className="stats-guide-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="stats-guide-header">
              <div>
                <p className="stats-guide-eyebrow">Reference</p>
                <h2 id={titleId}>Stats guide</h2>
              </div>
              <button className="stats-guide-close" type="button" aria-label="Close stats guide" onClick={close}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 4l12 12M16 4L4 16" />
                </svg>
              </button>
            </header>

            <label className="stats-guide-search">
              <span>Search stats</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Try ERA, exit velocity, or swing"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              />
            </label>

            <p className="stats-guide-count" aria-live="polite">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'stat' : 'stats'}
            </p>

            <div className="stats-guide-list" tabIndex={0} aria-label="Stat definitions">
              {filteredEntries.length === 0 ? (
                <p className="stats-guide-empty">No stats match “{query.trim()}”.</p>
              ) : (
                <dl>
                  {filteredEntries.map((entry) => (
                    <div className="stats-guide-entry" key={entry.term}>
                      <dt>
                        <span className="stats-guide-term">{entry.term}</span>
                        <span className="stats-guide-name">{entry.name}</span>
                      </dt>
                      {entry.formula === undefined ? null : (
                        <dd className="stats-guide-formula">{entry.formula}</dd>
                      )}
                      <dd className="stats-guide-description">{entry.description}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
