import { Navigate, Route, BrowserRouter, Routes, useLocation, useNavigate } from 'react-router-dom'
import GenerateBarcodeForm from './components/forms/GenerateBarcodeForm'
import { ScanBarcodeForm } from './components/forms/ScanBarcodeForm'
import { GenerateCutPiecesForm } from './components/forms/GenerateCutPiecesForm'
import { InventoryVisualizer } from './components/InventoryVisualizer'
import { OwnerLogin } from './components/OwnerLogin'
import { OwnerPortal } from './components/OwnerPortal'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import { useAuth } from './hooks/useAuth'
import { useTheme, Theme } from './hooks/useTheme'
import { supabase } from './lib/supabase'
import { User } from '@supabase/supabase-js'
import { ReactNode } from 'react'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/stock-in': 'Generate Barcode',
  '/items': 'Scan Barcode',
  '/cut-pieces': 'Generate Barcode for Cut Pieces',
  '/visualizer': 'Inventory Visualizer',
  '/settings': 'Account',
  '/owner/inventory': 'Inventory Overview',
  '/owner/remnants': 'Remnants',
  '/owner/alerts': 'Price Alerts',
  '/owner/approvals': 'Pending Approvals',
  '/owner/ai': 'AI Assistant',
}

function OwnerRoute({ user, children }: { user: User | null; children: ReactNode }) {
  if (!user) return <Navigate to="/owner-login" replace />
  return <>{children}</>
}

function Shell({ theme, toggleTheme, user }: { theme: Theme; toggleTheme: () => void; user: User | null }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'MK Industrials'

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const navigate = useNavigate()
  const goHome = () => navigate('/')

  return (
    <AppLayout theme={theme} toggleTheme={toggleTheme} user={user} onLogout={handleLogout} title={title}>
      <Routes>
        <Route path="/" element={<DashboardPage theme={theme} user={user} />} />

        <Route path="/stock-in" element={<GenerateBarcodeForm onBack={goHome} theme={theme} />} />
        <Route path="/items" element={<ScanBarcodeForm onBack={goHome} theme={theme} />} />
        <Route path="/cut-pieces" element={<GenerateCutPiecesForm onBack={goHome} theme={theme} />} />
        <Route path="/visualizer" element={<InventoryVisualizer theme={theme} />} />

        <Route path="/settings" element={<SettingsPage theme={theme} user={user} onLogout={handleLogout} />} />

        <Route
          path="/owner/inventory"
          element={<OwnerRoute user={user}><OwnerPortal onBack={goHome} theme={theme} initialTab="inventory" /></OwnerRoute>}
        />
        <Route
          path="/owner/remnants"
          element={<OwnerRoute user={user}><OwnerPortal onBack={goHome} theme={theme} initialTab="remnants" /></OwnerRoute>}
        />
        <Route
          path="/owner/alerts"
          element={<OwnerRoute user={user}><OwnerPortal onBack={goHome} theme={theme} initialTab="alerts" /></OwnerRoute>}
        />
        <Route
          path="/owner/approvals"
          element={<OwnerRoute user={user}><OwnerPortal onBack={goHome} theme={theme} initialTab="approvals" /></OwnerRoute>}
        />
        <Route
          path="/owner/ai"
          element={<OwnerRoute user={user}><OwnerPortal onBack={goHome} theme={theme} initialTab="ai" /></OwnerRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

function OwnerLoginRoute({ user, theme }: { user: User | null; theme: Theme }) {
  const navigate = useNavigate()
  if (user) return <Navigate to="/owner/inventory" replace />
  return (
    <OwnerLogin
      onBack={() => navigate('/')}
      onLoginSuccess={() => navigate('/owner/inventory')}
      theme={theme}
    />
  )
}

function App() {
  const { user, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]'
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="text-white text-center">
          <div className={`w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4 ${
            theme === 'dark' ? 'border-white/20 border-t-white' : 'border-gray-300 border-t-gray-600'
          }`}></div>
          <p className={theme === 'dark' ? 'text-white' : 'text-gray-700'}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/owner-login" element={<OwnerLoginRoute user={user} theme={theme} />} />
        <Route path="/*" element={<Shell theme={theme} toggleTheme={toggleTheme} user={user} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
