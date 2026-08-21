import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  readonly children: ReactNode
}

interface State {
  readonly error: Error | null
}

// A render throw in an offline PWA is otherwise a permanent white screen: the
// cached bundle keeps throwing on every launch with no way for the user to
// recover short of clearing site data. This offers an explicit reset that also
// drops the runtime caches, which is the usual culprit (stale payload + new code).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  private handleReset = (): void => {
    const clearCaches =
      typeof caches === 'undefined'
        ? Promise.resolve()
        : caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))

    void clearCaches
      .catch(() => {})
      .then(() => {
        try {
          sessionStorage.clear()
        } catch {
          // Private mode or blocked storage; the reload below still helps.
        }
        window.location.reload()
      })
  }

  render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <div className="app">
        <div className="ui-empty">
          <h2>Something went wrong</h2>
          <p>{error.message}</p>
          <button type="button" onClick={this.handleReset}>
            Clear cached data and reload
          </button>
        </div>
      </div>
    )
  }
}
