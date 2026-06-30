// Autenticação. Quando o Supabase está configurado, exige login (e-mail/senha
// ou magic link). Quando NÃO está (modo local/demo), o app roda sem login,
// preservando o comportamento atual com dados no navegador.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase, supabaseConfigured } from './supabase'

export interface AuthUser {
  id: string
  email: string
}

interface AuthValue {
  /** Já terminou de checar a sessão inicial. */
  ready: boolean
  /** True quando o app exige login (Supabase configurado). */
  requiresAuth: boolean
  user: AuthUser | null
  signInPassword: (email: string, password: string) => Promise<void>
  signUpPassword: (email: string, password: string) => Promise<{ precisaConfirmarEmail: boolean }>
  signInMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? '' } : null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabaseConfigured)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setReady(true)
      return
    }
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(toUser(data.session?.user))
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toUser(session?.user))
      setReady(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthValue>(() => {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
    return {
      ready,
      requiresAuth: supabaseConfigured,
      user,
      async signInPassword(email, password) {
        const { error } = await supabase!.auth.signInWithPassword({ email, password })
        if (error) throw new Error(traduzErro(error.message))
      },
      async signUpPassword(email, password) {
        const { data, error } = await supabase!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        })
        if (error) throw new Error(traduzErro(error.message))
        // Se não há sessão após signUp, é porque exige confirmação por e-mail.
        return { precisaConfirmarEmail: !data.session }
      },
      async signInMagicLink(email) {
        const { error } = await supabase!.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        })
        if (error) throw new Error(traduzErro(error.message))
      },
      async signOut() {
        await supabase!.auth.signOut()
        setUser(null)
      },
    }
  }, [ready, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

/** Traduz mensagens comuns do Supabase Auth para PT-BR amigável. */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'
  if (m.includes('user already registered')) return 'Este e-mail já tem cadastro. Faça login.'
  if (m.includes('password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'E-mail inválido.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.'
  return msg
}
