import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { ToastProvider } from './components/ToastContext'
import Toast from './components/Toast'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Waitlist from './pages/Waitlist'
import Members from './pages/Members'
import GeocodeFailures from './pages/GeocodeFailures'
import RunHistory from './pages/RunHistory'
import './index.css'

function ProtectedRoute() {
  return sessionStorage.getItem('adminKey') ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/groups" element={<Groups />} />
              <Route path="/admin/waitlist" element={<Waitlist />} />
              <Route path="/admin/members" element={<Members />} />
              <Route path="/admin/geocode-failures" element={<GeocodeFailures />} />
              <Route path="/admin/runs" element={<RunHistory />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
        <Toast />
      </ToastProvider>
    </BrowserRouter>
  )
}
