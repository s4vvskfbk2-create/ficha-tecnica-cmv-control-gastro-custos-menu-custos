import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App'
import MercadoriasPage from './pages/MercadoriasPage'
import FichasPage from './pages/FichasPage'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/mercadorias" replace /> },
      { path: 'mercadorias', element: <MercadoriasPage /> },
      { path: 'fichas', element: <FichasPage /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
