import { useState } from 'react'
import { createJob } from '../lib/jobApi'

export type PointPickerProps = {
  start: [number, number] | null
  end: [number, number] | null
  isRunning: boolean
  onClear: () => void
  onJobQueued: (jobId: string, label: string) => void
  onLog: (cls: string, text: string) => void
}

export function PointPicker(props: PointPickerProps) {
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!props.start || !props.end) return
    setSubmitting(true)
    const label = `${fmt(props.start)} → ${fmt(props.end)}`
    try {
      props.onLog('t-tool', `submitting · ${label}`)
      const resp = await createJob({
        start_end: {
          start_lat: props.start[0],
          start_lng: props.start[1],
          end_lat: props.end[0],
          end_lng: props.end[1],
        },
      })
      if (resp.status === 'rejected') {
        props.onLog('t-error', `rejected: ${resp.message ?? 'no reason'}`)
        return
      }
      props.onJobQueued(resp.job_id, label)
      props.onLog('t-tool', `queued · ${resp.job_id.slice(0, 8)}…`)
    } catch (err) {
      console.error('[PointPicker] submit failed', err)
      props.onLog('t-error', `error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const ready = !!props.start && !!props.end && !props.isRunning && !submitting

  return (
    <div className="picker">
      <ol className="picker-steps">
        <li className={props.start ? 'done' : 'active'}>
          <span className="picker-marker start" />
          <span className="picker-step-label">Start</span>
          <span className="picker-step-value">{props.start ? fmt(props.start) : 'click on the map'}</span>
        </li>
        <li className={props.end ? 'done' : props.start ? 'active' : ''}>
          <span className="picker-marker end" />
          <span className="picker-step-label">End</span>
          <span className="picker-step-value">{props.end ? fmt(props.end) : 'click on the map'}</span>
        </li>
      </ol>

      <div className="picker-actions">
        <button
          type="button"
          className="picker-clear"
          onClick={props.onClear}
          disabled={!props.start && !props.end}
        >
          Clear
        </button>
        <button
          type="button"
          className="job-panel-submit"
          onClick={submit}
          disabled={!ready}
        >
          {submitting ? 'Submitting…' : props.isRunning ? 'Survey in progress' : 'Start survey'}
        </button>
      </div>
    </div>
  )
}

function fmt(p: [number, number]): string {
  return `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`
}
