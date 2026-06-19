import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import {
  clearAuth,
  getStoredUser,
  login as apiLogin,
  storeAuth,
  type Role,
  type UserOut,
} from '../lib/erpApi'

type AuthState = {
  user: UserOut | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (...roles: Role[]) => boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(getStoredUser())

  const login = useCallback(async (email: string, password: string) => {
    const resp = await apiLogin(email, password)
    storeAuth(resp.token, resp.user)
    setUser(resp.user)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setUser(null)
    window.location.hash = '#/login'
  }, [])

  const hasRole = useCallback(
    (...roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user],
  )

  return <Ctx.Provider value={{ user, login, logout, hasRole }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
