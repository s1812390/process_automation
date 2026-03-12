import { useLocation } from 'react-router-dom'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/scripts': 'Scripts',
  '/settings': 'Settings',
}

export function Header() {
  const location = useLocation()

  const getTitle = () => {
    if (location.pathname.startsWith('/scripts/') && location.pathname !== '/scripts') {
      return 'Script Detail'
    }
    if (location.pathname.startsWith('/runs/')) {
      return 'Run Detail'
    }
    return pageTitles[location.pathname] || 'Scheduler'
  }

  return (
    <header className="bg-white/55 backdrop-blur-xl border-b border-[rgba(99,112,156,0.12)] sticky top-0 z-10 px-6 py-3.5 flex items-center justify-between">
      <h1 className="text-[18px] font-[800] text-ink-1">{getTitle()}</h1>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <span className="text-[12px] text-ink-3 font-[500]">Online</span>
      </div>
    </header>
  )
}
