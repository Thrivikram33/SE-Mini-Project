import { Component, Suspense, lazy, useEffect, useState } from 'react'
import TrainFallback from './TrainFallback.jsx'

const TrainExperience = lazy(() => import('./TrainExperience.jsx'))

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export default function TrainHero() {
  const [webGLAvailable] = useState(() => typeof document !== 'undefined' && hasWebGL())
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = (event) => setReducedMotion(event.matches)
    preference.addEventListener?.('change', updatePreference)
    return () => preference.removeEventListener?.('change', updatePreference)
  }, [])

  const useScene = webGLAvailable && !reducedMotion && !failed
  return (
    <div className="hero-art" aria-hidden="true">
      {useScene
        ? <SceneBoundary fallback={<TrainFallback />}>
          <Suspense fallback={<TrainFallback loading />}>
            <TrainExperience onContextLost={() => setFailed(true)} />
          </Suspense>
        </SceneBoundary>
        : <TrainFallback loading={!webGLAvailable && !failed && !reducedMotion} />}
    </div>
  )
}
