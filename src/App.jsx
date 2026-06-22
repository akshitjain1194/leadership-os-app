import { useAuth } from './hooks/useAuth'
import Auth from './components/Auth'
import LoadingSpinner from './components/LoadingSpinner'
import Toast from './components/Toast'
import { RouterProvider } from 'react-router-dom'
import { buildRouter } from './router'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingSpinner message="Starting up…" />
  if (!user) return (
    <>
      <Auth />
      <Toast />
    </>
  )

  return (
    <>
      <RouterProvider router={buildRouter(user)} />
      <Toast />
    </>
  )
}
