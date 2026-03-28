import React from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-[#222427] text-red-400 p-8">
          <div className="max-w-lg text-sm font-mono">
            <div className="text-red-500 font-bold mb-2">Error de renderizado</div>
            <pre className="text-xs text-gray-400 whitespace-pre-wrap">{this.state.error.message}</pre>
            <button
              className="mt-4 px-3 py-1 bg-[#3d85c8] text-white text-xs rounded hover:bg-[#5a9fd4]"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
