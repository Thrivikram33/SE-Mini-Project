export default function TrainFallback({ loading = false }) {
  return (
    <div className="scene-fallback">
      <div className="sun" />
      <div className="landscape">
        <div className="hill hill-back" />
        <div className="hill hill-front" />
      </div>
      <div className="rail-line rail-line-one" />
      <div className="rail-line rail-line-two" />
      <div className="train-illustration">
        <div className="train-window-row"><i /><i /><i /><i /></div>
        <div className="train-front"><span /></div>
        <div className="train-wheels"><i /><i /><i /><i /></div>
      </div>
      <div className="art-label"><span className="label-dot" /> {loading ? 'LOADING RAILWAY SCENE' : 'STATIC RAILWAY SCENE'}</div>
    </div>
  )
}
