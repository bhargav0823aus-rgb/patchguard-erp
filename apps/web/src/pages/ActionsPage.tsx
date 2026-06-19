import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listActions, updateAction, type ActionOut } from '../lib/erpApi'

const STATUSES = ['open', 'notified', 'resolved', 'disputed'] as const

export function ActionsPage() {
  const { hasRole } = useAuth()
  const canUpdate = hasRole('admin', 'inspector')
  const [actions, setActions] = useState<ActionOut[]>([])
  const [filter, setFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ActionOut | null>(null)

  const refresh = useCallback(async () => {
    try {
      setActions(await listActions(filter || undefined))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [filter])

  useEffect(() => { refresh() }, [refresh])

  async function setStatus(a: ActionOut, status: string) {
    await updateAction(a.id, { status })
    refresh()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Actions</h1>
        <div className="filter-row">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">all statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="picker-clear" onClick={refresh} type="button">Refresh</button>
        </div>
      </div>
      <p className="page-sub">
        Raised automatically when inspection damage lands within 30&nbsp;m of a work path that's
        still under guarantee.
      </p>
      {error && <div className="error-text">{error}</div>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Status</th><th>Contractor</th><th>Work</th><th>Work date</th>
            <th>Guarantee until</th><th>Damage</th><th>Distance</th><th>Raised</th><th></th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id}>
              <td>
                {canUpdate ? (
                  <select
                    className={`status-select status-${a.status}`}
                    value={a.status}
                    onChange={(e) => setStatus(a, e.target.value)}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <span className={`status-pill status-${a.status}`}>{a.status}</span>
                )}
              </td>
              <td>{a.contractor_name}</td>
              <td>{a.work_title}</td>
              <td>{a.work_date}</td>
              <td>{a.guarantee_expires}</td>
              <td>
                {a.damage_class ?? '—'}
                {a.damage_confidence != null && ` (${(a.damage_confidence * 100).toFixed(0)}%)`}
              </td>
              <td>{a.distance_m.toFixed(0)} m</td>
              <td>{new Date(a.created_at).toLocaleDateString()}</td>
              <td><button className="link-btn" onClick={() => setSelected(a)} type="button">View</button></td>
            </tr>
          ))}
          {actions.length === 0 && (
            <tr><td colSpan={9} className="entity-empty">No actions{filter ? ` with status "${filter}"` : ''}.</td></tr>
          )}
        </tbody>
      </table>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <strong>{selected.damage_class ?? 'Damage'} · {selected.contractor_name}</strong>
                <div className="modal-meta">
                  {selected.image_lat.toFixed(5)}, {selected.image_lng.toFixed(5)} ·{' '}
                  {selected.distance_m.toFixed(0)} m from "{selected.work_title}" ·
                  guarantee until {selected.guarantee_expires}
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelected(null)} type="button">×</button>
            </div>
            <img className="modal-image" src={selected.annotated_image_url} alt="Annotated road damage" />
            {selected.vision_description && (
              <div className="modal-vision">{selected.vision_description}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
