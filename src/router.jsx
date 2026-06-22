import { createBrowserRouter, Navigate } from 'react-router-dom'
import Shell from './components/Shell'
import ComingSoon from './components/ComingSoon'
import CapturePage      from './pages/CapturePage'
import ThisWeekPage     from './pages/ThisWeekPage'
import ReflectionLogPage from './pages/ReflectionLogPage'
import DashboardPage    from './pages/DashboardPage'

export function buildRouter(user) {
  return createBrowserRouter([
    {
      path: '/',
      element: <Shell user={user} />,
      children: [
        { index: true, element: <Navigate to="/capture" replace /> },
        { path: 'capture',        element: <CapturePage /> },
        { path: 'this-week',      element: <ThisWeekPage /> },
        { path: 'reflection-log', element: <ReflectionLogPage /> },
        { path: 'dashboard',      element: <DashboardPage /> },
        { path: '*',              element: <ComingSoon /> },
      ],
    },
  ])
}
