import { NavLink, Outlet } from 'react-router-dom'
import { supabaseConfigured } from './lib/supabase'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">🍽️ Ficha Técnica &amp; CMV</span>
        <nav>
          <NavLink to="/mercadorias" className={({ isActive }) => (isActive ? 'active' : '')}>
            Mercadorias
          </NavLink>
          <NavLink to="/fichas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Fichas Técnicas
          </NavLink>
        </nav>
        <span className="spacer" />
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
