import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from './lib/store'
import { supabase, supabaseConfigured } from './lib/supabase'
import { labelSegmento } from './lib/benchmark'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/mercadorias', label: 'Mercadorias' },
  { to: '/fichas', label: 'Fichas Técnicas' },
  { to: '/cardapio', label: 'Cardápio' },
  { to: '/relatorios', label: 'Relatórios' },
]

export default function App() {
  const { estabelecimentos, estabelecimento, selecionarEstabelecimento } = useStore()

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">🍽️ Ficha Técnica &amp; CMV</span>
        <nav>
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        {estabelecimento && (
          <label className="estab-select">
            <select
              value={estabelecimento.id}
              onChange={(e) => selecionarEstabelecimento(e.target.value)}
              title="Estabelecimento ativo"
            >
              {estabelecimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} · {labelSegmento(e.segmento)}
                </option>
              ))}
            </select>
          </label>
        )}
        <AuthControls />
        <span className="mode" title={supabaseConfigured ? 'Conectado ao Supabase' : 'Dados salvos no navegador'}>
          {supabaseConfigured ? 'Supabase' : 'Modo local'}
        </span>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}


function AuthControls() {
  const [email, setEmail] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigured || !supabase) return
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!supabaseConfigured || !supabase) return null

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!email.trim()) return
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setMsg(error ? error.message : 'Enviamos um link de acesso para seu e-mail.')
  }

  async function sair() {
    await supabase!.auth.signOut()
    setMsg(null)
  }

  return userEmail ? (
    <div className="auth-box" title={userEmail}>
      <span>{userEmail}</span>
      <button className="topbar-btn" onClick={sair}>Sair</button>
    </div>
  ) : (
    <form className="auth-box" onSubmit={entrar}>
      <input aria-label="E-mail para login" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
      <button className="topbar-btn" type="submit">Entrar</button>
      {msg && <span className="auth-msg">{msg}</span>}
    </form>
  )
}
