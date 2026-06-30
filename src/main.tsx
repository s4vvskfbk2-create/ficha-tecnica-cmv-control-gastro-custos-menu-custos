import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './lib/store'
import DashboardPage from './pages/DashboardPage'
import MercadoriasPage from './pages/MercadoriasPage'
import FichasPage from './pages/FichasPage'
import FichaEditorPage from './pages/FichaEditorPage'
import ImportarReceitaPage from './pages/ImportarReceitaPage'
import CardapioPage from './pages/CardapioPage'
import RelatoriosPage from './pages/RelatoriosPage'
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
      { path: 'relatorios', element: <RelatoriosPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>
  </React.StrictMode>,
)
