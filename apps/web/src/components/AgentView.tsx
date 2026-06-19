import { useEffect, useMemo, useRef, useState } from 'react'

export type AgentViewProps = {
  livePreviewB64: string | null   // raw Earth screenshot from progress event
  liveIndex: number | null
  liveLatLng: [number, number] | null
  total: number
  annotated: {
    url: string
    damages: number
    description: string | null
  } | null
}

// Two-state live view:
//   LIVE      — most recent raw Earth screenshot (per-waypoint, ~1s cadence)
//   ANALYZED  — most recent backend-annotated image with YOLOv5 boxes + Vision caption
//
// The card flips between them based on which arrived most recently. Live always wins
// the next moment a new progress event lands, so during steady capture you see LIVE most
// of the time, with brief ANALYZED flashes after each batch upload.
export function AgentView(props: AgentViewProps) {
  const [showAnalyzed, setShowAnalyzed] = useState(false)
  const lastAnnotatedRef = useRef<string | null>(null)

  // When a new annotated comes in, show it briefly. Reset to LIVE on the next preview.
  useEffect(() => {
    if (props.annotated && props.annotated.url !== lastAnnotatedRef.current) {
      lastAnnotatedRef.current = props.annotated.url
      setShowAnalyzed(true)
    }
  }, [props.annotated])

  useEffect(() => {
    if (showAnalyzed && props.livePreviewB64) {
      // New live frame arrived after an analyzed flash — go back to LIVE.
      setShowAnalyzed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.livePreviewB64])

  // Convert the raw base64 jpeg into a stable Object URL, and revoke the previous one.
  const liveUrl = useMemo(() => {
    if (!props.livePreviewB64) return null
    const binary = atob(props.livePreviewB64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    return URL.createObjectURL(blob)
  }, [props.livePreviewB64])

  useEffect(() => {
    if (!liveUrl) return
    return () => URL.revokeObjectURL(liveUrl)
  }, [liveUrl])

  const hasAny = !!liveUrl || !!props.annotated
  if (!hasAny) {
    return (
      <div className="agent-view empty">
        <div className="agent-view-placeholder">Waiting for first capture…</div>
      </div>
    )
  }

  const showing: 'live' | 'analyzed' =
    showAnalyzed && props.annotated ? 'analyzed' : liveUrl ? 'live' : 'analyzed'

  return (
    <div className="agent-view">
      <div className="agent-view-img-wrap">
        {showing === 'live' && liveUrl && (
          <img key={liveUrl} src={liveUrl} alt="live agent view" />
        )}
        {showing === 'analyzed' && props.annotated && (
          <img key={props.annotated.url} src={props.annotated.url} alt="analyzed capture" />
        )}
        <div className="agent-view-badge">
          {showing === 'live' ? (
            <span className="badge-live">
              <span className="badge-dot" /> LIVE
            </span>
          ) : (
            <span className="badge-analyzed">ANALYZED</span>
          )}
        </div>
        {showing === 'live' && props.liveIndex !== null && (
          <div className="agent-view-meta">
            <span>#{props.liveIndex + 1}{props.total ? ` / ${props.total}` : ''}</span>
            {props.liveLatLng && (
              <span className="agent-view-coords">
                {props.liveLatLng[0].toFixed(5)}, {props.liveLatLng[1].toFixed(5)}
              </span>
            )}
          </div>
        )}
        {showing === 'analyzed' && props.annotated && (
          <div className="agent-view-meta">
            <span className={props.annotated.damages > 0 ? 'meta-hot' : 'meta-clean'}>
              {props.annotated.damages > 0
                ? `${props.annotated.damages} damage${props.annotated.damages === 1 ? '' : 's'}`
                : 'no damage'}
            </span>
          </div>
        )}
      </div>
      {showing === 'analyzed' && props.annotated?.description && (
        <div className="agent-view-caption">{props.annotated.description}</div>
      )}
    </div>
  )
}
