import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Lock, LogIn } from 'lucide-react'
import { Theme } from '../../hooks/useTheme'
import { topNavItems, navGroups } from './navConfig'

interface SidebarProps {
  theme: Theme
  hasOwnerAccess: boolean
}

export function Sidebar({ theme, hasOwnerAccess }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(navGroups.map(g => [g.label, true]))
  )

  const toggleGroup = (label: string) =>
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }))

  const dark = theme === 'dark'

  const linkClasses = (isActive: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200 ${
      isActive
        ? dark
          ? 'bg-white/15 text-white shadow-inner'
          : 'bg-white/70 text-gray-900 shadow-sm'
        : dark
        ? 'text-white/70 hover:bg-white/10 hover:text-white'
        : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
    }`

  return (
    <aside
      className={`sticky top-0 h-screen shrink-0 transition-all duration-300 flex flex-col border-r ${
        collapsed ? 'w-[76px]' : 'w-[260px]'
      } ${
        dark
          ? 'bg-[#031522]/80 border-white/10'
          : 'bg-white/60 border-gray-200'
      }`}
      style={{ backdropFilter: 'blur(16px)' }}
    >
      {/* Workspace switcher */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 p-1 ${
          dark ? 'bg-white/10 border border-white/20' : 'bg-white border border-gray-200 shadow'
        }`}>
          <img src="https://mkindustrialandco.com/IMAGES/logo-registered.png" alt="MK" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className={`text-sm font-semibold truncate ${dark ? 'text-white' : 'text-gray-900'}`}>
              MK Industrials
            </div>
            <div className={`text-xs truncate ${dark ? 'text-white/50' : 'text-gray-500'}`}>Inventory</div>
          </div>
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Top-level items */}
        <div className="space-y-1">
          {topNavItems.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => linkClasses(isActive)}>
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>

        {/* Grouped sections */}
        {navGroups.map(group => (
          <div key={group.label}>
            {!collapsed ? (
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center justify-between px-3 mb-1 text-xs font-semibold uppercase tracking-wide ${
                  dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openGroups[group.label] ? '' : '-rotate-90'}`} />
              </button>
            ) : (
              <div className={`h-px mx-2 mb-2 ${dark ? 'bg-white/10' : 'bg-gray-200'}`} />
            )}

            {(collapsed || openGroups[group.label]) && (
              <div className="space-y-1">
                {group.items.map(item => {
                  const locked = item.ownerOnly && !hasOwnerAccess
                  return (
                    <NavLink
                      key={item.path}
                      to={locked ? '/owner-login' : item.path}
                      className={({ isActive }) => linkClasses(isActive && !locked)}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                      {!collapsed && locked && <Lock className="w-3.5 h-3.5 opacity-50 shrink-0" />}
                    </NavLink>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {!hasOwnerAccess && (
          <NavLink
            to="/owner-login"
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm border border-dashed ${
              dark ? 'border-white/20 text-white/70 hover:bg-white/10' : 'border-gray-300 text-gray-600 hover:bg-white/50'
            }`}
          >
            <LogIn className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Owner Login</span>}
          </NavLink>
        )}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`m-3 flex items-center justify-center gap-2 rounded-lg py-2 text-xs ${
          dark ? 'bg-white/10 text-white/70 hover:bg-white/15' : 'bg-white/60 text-gray-600 hover:bg-white/80'
        }`}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Collapse</>}
      </button>
    </aside>
  )
}
