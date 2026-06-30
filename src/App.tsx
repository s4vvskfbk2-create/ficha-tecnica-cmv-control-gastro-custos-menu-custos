import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from './lib/store'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import { labelSegmento } from './lib/benchmark'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/mercadorias', label: 'Mercadorias' },
  { to: '/fichas', label: 'Fichas Técnicas' },
  { to: '/cardapio', label: 'Cardápio' },
]

export default function App() {
  const { estabelecimentos, estabelecimento, selecionarEstabelecimento } = useStore()
  const { requiresAuth, user, signOut } = useAuth()

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
        <span className="mode" title={supabaseConfigured ? 'Conectado ao Supabase' : 'Dados salvos no navegador'}>
          {supabaseConfigured ? 'Supabase' : 'Modo local'}
        </span>
        {requiresAuth && user && (
          <span className="user-box">
            <span className="user-email" title={user.email}>{user.email}</span>
            <button className="btn sm" onClick={() => signOut()}>Sair</button>
          </span>
        )}
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  )
}
