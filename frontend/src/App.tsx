import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import Dashboard from './pages/Dashboard'
import Scripts from './pages/Scripts'
import ScriptDetail from './pages/ScriptDetail'
import RunDetail from './pages/RunDetail'
import SettingsPage from './pages/Settings'
import VariablesPage from './pages/Variables'
import { TimezoneProvider } from './context/TimezoneContext'

export default function App() {
  return (
    <BrowserRouter>
    <TimezoneProvider>
      <div className="flex h-screen overflow-hidden bg-bg">
        {/* Background blobs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="blob-animate absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-violet/[0.04] blur-3xl" />
          <div className="blob-animate-delay absolute bottom-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full bg-accent/[0.04] blur-3xl" />
        </div>
        {/* Grid overlay */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99,112,156,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99,112,156,0.04) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/scripts/:id" element={<ScriptDetail />} />
              <Route path="/runs/:id" element={<RunDetail />} />
              <Route path="/variables" element={<VariablesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </TimezoneProvider>
    </BrowserRouter>
  )
}
