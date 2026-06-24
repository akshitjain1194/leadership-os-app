import { useAuth } from './hooks/useAuth'
import Auth from './components/Auth'
import LoadingSpinner from './components/LoadingSpinner'
import Toast from './components/Toast'
import { RouterProvider } from 'react-router-dom'
import { buildRouter } from './router'
import { UserProfileProvider, useUserProfile } from './contexts/UserProfileContext'
import OnboardingPage from './pages/OnboardingPage'

function AppContent({ user }) {
  const { loading: profileLoading, hasProfile } = useUserProfile()

  if (profileLoading) return <LoadingSpinner message="Loading profile…" />
  if (!hasProfile) return <><OnboardingPage /><Toast /></>

  return (
    <>
      <RouterProvider router={buildRouter(user)} />
      <Toast />
    </>
  )
}

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
    <UserProfileProvider user={user}>
      <AppContent user={user} />
    </UserProfileProvider>
  )
}
