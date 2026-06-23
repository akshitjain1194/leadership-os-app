import { createBrowserRouter, Navigate } from 'react-router-dom'
import Shell from './components/Shell'
import ComingSoon from './components/ComingSoon'
import CapturePage      from './pages/CapturePage'
import ThisWeekPage     from './pages/ThisWeekPage'
import ReflectionLogPage from './pages/ReflectionLogPage'
import DashboardPage    from './pages/DashboardPage'
import PeoplePage       from './pages/PeoplePage'
import AspirationsPage  from './pages/AspirationsPage'

export function buildRouter(user) {
  return createBrowserRouter([
    {
      path: '/',
      element: <Shell user={user} />,
      children: [
        { index: true, element: <Navigate to="/capture" replace /> },
        { path: 'capture',          element: <CapturePage /> },
        { path: 'this-week',        element: <ThisWeekPage /> },
        { path: 'aspirations',      element: <AspirationsPage /> },
        { path: 'reflection-log',   element: <ReflectionLogPage /> },
        { path: 'dashboard',        element: <DashboardPage /> },
        { path: 'strategic/people', element: <PeoplePage /> },
        { path: '*',                element: <ComingSoon /> },
      ],
    },
  ])
}
