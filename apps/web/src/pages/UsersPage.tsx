import { useCallback, useEffect, useState } from 'react'
import {
  createUser, listUsers, updateUser,
  type Role, type UserOut,
} from '../lib/erpApi'

const ROLES: Role[] = ['admin', 'inspector', 'viewer']

export function UsersPage() {
  const [users, setUsers] = useState<UserOut[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<UserOut | null>(null)

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div className="page">
      <div className="page-head">
        <h1>Users &amp; Accounts</h1>
        <button className="primary-btn" onClick={() => setShowCreate(true)} type="button">
          + New user
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
      <table className="data-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.is_active ? '' : 'row-inactive'}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td><span className={`role-pill role-${u.role}`}>{u.role}</span></td>
              <td>{u.is_active ? 'active' : 'deactivated'}</td>
              <td><button className="link-btn" onClick={() => setEditing(u)} type="button">Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCreate && (
        <UserModal
          title="Create user"
          onClose={() => setShowCreate(false)}
          onSubmit={async (form) => {
            await createUser({
              email: form.email, full_name: form.full_name,
              role: form.role, password: form.password!,
            })
            setShowCreate(false)
            refresh()
          }}
          requirePassword
        />
      )}
      {editing && (
        <UserModal
          title={`Edit ${editing.email}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (form) => {
            await updateUser(editing.id, {
              full_name: form.full_name,
              role: form.role,
              is_active: form.is_active,
              ...(form.password ? { password: form.password } : {}),
            })
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

type UserForm = {
  email: string
  full_name: string
  role: Role
  password?: string
  is_active: boolean
}

function UserModal({
  title, initial, requirePassword, onClose, onSubmit,
}: {
  title: string
  initial?: UserOut
  requirePassword?: boolean
  onClose: () => void
  onSubmit: (form: UserForm) => Promise<void>
}) {
  const [form, setForm] = useState<UserForm>({
    email: initial?.email ?? '',
    full_name: initial?.full_name ?? '',
    role: initial?.role ?? 'viewer',
    password: '',
    is_active: initial?.is_active ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal form-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <strong>{title}</strong>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">×</button>
        </div>
        <div className="form-body">
          <label className="form-label">Email
            <input
              type="email" required disabled={!!initial}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="form-label">Full name
            <input
              type="text" required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </label>
          <label className="form-label">Role
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="form-label">{initial ? 'Reset password (leave blank to keep)' : 'Password'}
            <input
              type="password" minLength={8} required={requirePassword}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {initial && (
            <label className="form-check">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Account active
            </label>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
        <div className="form-actions">
          <button className="picker-clear" onClick={onClose} type="button">Cancel</button>
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
