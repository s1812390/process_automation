import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Code2, Settings, Clock, Variable, Play, Box } from 'lucide-react'
import { clsx } from 'clsx'

const commitCount = import.meta.env.VITE_COMMIT_COUNT || '0'
const commitMessage = import.meta.env.VITE_COMMIT_MESSAGE || ''
const appVersion = `v1.${commitCount}`

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/runs', icon: Play, label: 'Runs' },
  { to: '/scripts', icon: Code2, label: 'Scripts' },
  { to: '/environments', icon: Box, label: 'Python Envs' },
  { to: '/variables', icon: Variable, label: 'Global Variables' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-white/80 backdrop-blur-xl border-r border-[rgba(99,112,156,0.12)] z-20 relative">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[rgba(99,112,156,0.08)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet to-accent flex items-center justify-center shadow-sm">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-[13px] font-[800] text-ink-1 leading-none">Scheduler</div>
            <div className="text-[10px] font-[500] text-ink-3 mt-0.5">Job Manager</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="text-[9.5px] font-[800] uppercase tracking-[0.9px] text-ink-3 px-2 mb-2">
          Main
        </div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all duration-150',
                isActive
                  ? 'bg-accent-dim text-accent font-[700]'
                  : 'text-ink-2 font-[500] hover:bg-bg hover:text-ink-1'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[rgba(99,112,156,0.08)]">
        <div
          className="text-[10px] text-ink-3 cursor-default select-none"
          title={commitMessage || appVersion}
        >
          {appVersion}
        </div>
      </div>
    </aside>
  )
}
