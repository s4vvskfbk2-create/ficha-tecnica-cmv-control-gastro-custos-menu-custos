import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App'
import { AuthProvider, useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MercadoriasPage from './pages/MercadoriasPage'
import FichasPage from './pages/FichasPage'
import FichaEditorPage from './pages/FichaEditorPage'
import ImportarReceitaPage from './pages/ImportarReceitaPage'
import CardapioPage from './pages/CardapioPage'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'mercadorias', element: <MercadoriasPage /> },
      { path: 'fichas', element: <FichasPage /> },
      { path: 'fichas/importar', element: <ImportarReceitaPage /> },
      { path: 'fichas/:id', element: <FichaEditorPage /> },
      { path: 'cardapio', element: <CardapioPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

/** Decide entre tela de login e o app, conforme a sessão. */
function AuthGate() {
  const { ready, requiresAuth, user } = useAuth()
  if (!ready) {
    return <div className="login-wrap"><div className="muted-sm">Carregando…</div></div>
  }
  if (requiresAuth && !user) {
    return <LoginPage />
  }
  return (
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
    <SpeedInsights />
  </React.StrictMode>,
)
