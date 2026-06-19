import { useCallback, useEffect, useState } from 'react'
import { MapContainer, Polyline, TileLayer } from 'react-leaflet'
import { useAuth } from '../auth/AuthContext'
import { WorkPathEditor } from '../components/WorkPathEditor'
import {
  createContractor, createWorkRecord, downloadInvoice, listContractors,
  listWorkRecords, uploadInvoice,
  type ContractorOut, type WorkRecordOut,
} from '../lib/erpApi'

export function ContractorsPage() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [contractors, setContractors] = useState<ContractorOut[]>([])
  const [selected, setSelected] = useState<ContractorOut | null>(null)
  const [records, setRecords] = useState<WorkRecordOut[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showNewContractor, setShowNewContractor] = useState(false)
  const [showNewRecord, setShowNewRecord] = useState(false)
  const [viewRecord, setViewRecord] = useState<WorkRecordOut | null>(null)

  const refreshContractors = useCallback(async () => {
    try {
      const list = await listContractors()
      setContractors(list)
      setError(null)
      return list
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return []
    }
  }, [])

  const refreshRecords = useCallback(async (contractorId: string) => {
    try {
      setRecords(await listWorkRecords(contractorId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    refreshContractors().then((list) => {
      if (list.length > 0) {
        setSelected(list[0])
        refreshRecords(list[0].id)
      }
    })
  }, [refreshContractors, refreshRecords])

  function pick(c: ContractorOut) {
    setSelected(c)
    refreshRecords(c.id)
  }

  return (
    <div className="page page-split">
      <aside className="split-left">
        <div className="page-head">
          <h2>Contractors</h2>
          {isAdmin && (
            <button className="primary-btn" onClick={() => setShowNewContractor(true)} type="button">+</button>
          )}
        </div>
        {error && <div className="error-text">{error}</div>}
        <ul className="entity-list">
          {contractors.map((c) => (
            <li
              key={c.id}
              className={selected?.id === c.id ? 'active' : ''}
              onClick={() => pick(c)}
            >
              <strong>{c.name}</strong>
              <span className="entity-meta">{c.work_record_count} work record(s)</span>
              {c.contact_email && <span className="entity-meta">{c.contact_email}</span>}
            </li>
          ))}
          {contractors.length === 0 && <li className="entity-empty">No contractors yet</li>}
        </ul>
      </aside>

      <section className="split-right">
        {selected ? (
          <>
            <div className="page-head">
              <h2>{selected.name} — work records</h2>
              {isAdmin && (
                <button className="primary-btn" onClick={() => setShowNewRecord(true)} type="button">
                  + New work record
                </button>
              )}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th><th>Work date</th><th>Cost</th><th>Hours</th>
                  <th>Guarantee</th><th>Expires</th><th>Invoice</th><th>Map</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.work_date}</td>
                    <td>${r.cost.toLocaleString()}</td>
                    <td>{r.hours_spent}</td>
                    <td>{r.guarantee_months} mo</td>
                    <td className={new Date(r.guarantee_expires) >= new Date() ? 'guarantee-live' : 'guarantee-dead'}>
                      {r.guarantee_expires}
                    </td>
                    <td>
                      {r.has_invoice ? (
                        <button className="link-btn" onClick={() => downloadInvoice(r.id)} type="button">PDF ⬇</button>
                      ) : isAdmin ? (
                        <InvoiceUploadButton recordId={r.id} onDone={() => refreshRecords(selected.id)} />
                      ) : '—'}
                    </td>
                    <td>
                      {r.path ? (
                        <button className="link-btn" onClick={() => setViewRecord(r)} type="button">view</button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr><td colSpan={8} className="entity-empty">No work records for this contractor</td></tr>
                )}
              </tbody>
            </table>
          </>
        ) : (
          <div className="entity-empty" style={{ padding: 40 }}>Select or create a contractor</div>
        )}
      </section>

      {showNewContractor && (
        <NewContractorModal
          onClose={() => setShowNewContractor(false)}
          onCreated={async () => {
            setShowNewContractor(false)
            const list = await refreshContractors()
            if (list.length > 0) pick(list[list.length - 1])
          }}
        />
      )}
      {showNewRecord && selected && (
        <NewWorkRecordModal
          contractorId={selected.id}
          onClose={() => setShowNewRecord(false)}
          onCreated={() => {
            setShowNewRecord(false)
            refreshRecords(selected.id)
            refreshContractors()
          }}
        />
      )}
      {viewRecord?.path && (
        <div className="modal-backdrop" onClick={() => setViewRecord(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <strong>{viewRecord.title}</strong>
                <div className="modal-meta">
                  {viewRecord.work_date} · guarantee until {viewRecord.guarantee_expires}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewRecord(null)} type="button">×</button>
            </div>
            <div style={{ height: 380 }}>
              <MapContainer
                bounds={viewRecord.path.map(([a, b]) => [a, b]) as [number, number][]}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                <Polyline positions={viewRecord.path} pathOptions={{ color: '#f59e0b', weight: 5 }} />
              </MapContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InvoiceUploadButton({ recordId, onDone }: { recordId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className="link-btn" style={{ cursor: 'pointer' }}>
      {busy ? 'uploading…' : 'upload'}
      <input
        type="file" accept="application/pdf" style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setBusy(true)
          try {
            await uploadInvoice(recordId, file)
            onDone()
          } finally {
            setBusy(false)
          }
        }}
      />
    </label>
  )
}

function NewContractorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', abn: '', contact_email: '', phone: '' })
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal form-modal" onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await createContractor({
              name: form.name,
              abn: form.abn || undefined,
              contact_email: form.contact_email || undefined,
              phone: form.phone || undefined,
            })
            onCreated()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <div className="modal-header">
          <strong>New contractor</strong>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <div className="form-body">
          <label className="form-label">Company name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="form-label">ABN
            <input value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} />
          </label>
          <label className="form-label">Contact email
            <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </label>
          <label className="form-label">Phone
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="form-actions">
          <button className="picker-clear" onClick={onClose} type="button">Cancel</button>
          <button className="primary-btn" type="submit">Create</button>
        </div>
      </form>
    </div>
  )
}

function NewWorkRecordModal({
  contractorId, onClose, onCreated,
}: { contractorId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', work_date: '', cost: '', hours_spent: '', guarantee_months: '24', notes: '',
  })
  const [path, setPath] = useState<[number, number][]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal form-modal form-modal-wide" onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await createWorkRecord(contractorId, {
              title: form.title,
              work_date: form.work_date,
              cost: parseFloat(form.cost),
              hours_spent: parseFloat(form.hours_spent),
              guarantee_months: parseInt(form.guarantee_months, 10),
              path: path.length >= 2 ? path : null,
              notes: form.notes || undefined,
            })
            onCreated()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            setBusy(false)
          }
        }}
      >
        <div className="modal-header">
          <strong>New work record</strong>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>
        <div className="form-body form-grid">
          <div>
            <label className="form-label">Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="form-label">Work date
              <input type="date" required value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} />
            </label>
            <label className="form-label">Cost (AUD)
              <input type="number" step="0.01" min="0" required value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </label>
            <label className="form-label">Hours spent
              <input type="number" step="0.5" min="0" required value={form.hours_spent} onChange={(e) => setForm({ ...form, hours_spent: e.target.value })} />
            </label>
            <label className="form-label">Guarantee (months)
              <input type="number" min="0" max="120" required value={form.guarantee_months} onChange={(e) => setForm({ ...form, guarantee_months: e.target.value })} />
            </label>
            <label className="form-label">Notes
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>Work path (click map to draw)</div>
            <WorkPathEditor value={path} onChange={setPath} />
          </div>
        </div>
        {error && <div className="error-text" style={{ padding: '0 16px' }}>{error}</div>}
        <div className="form-actions">
          <button className="picker-clear" onClick={onClose} type="button">Cancel</button>
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Create record'}
          </button>
        </div>
      </form>
    </div>
  )
}
