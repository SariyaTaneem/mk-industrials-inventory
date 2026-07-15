import { ReactNode } from 'react'
import { Sun, Moon, LogOut } from 'lucide-react'
import { Theme } from '../../hooks/useTheme'
import { Sidebar } from './Sidebar'
import { User } from '@supabase/supabase-js'

interface AppLayoutProps {
  theme: Theme
  toggleTheme: () => void
  user: User | null
  onLogout: () => void
  title: string
  children: ReactNode
}

export function AppLayout({ theme, toggleTheme, user, onLogout, title, children }: AppLayoutProps) {
  const dark = theme === 'dark'

  return (
    <div className={`min-h-screen flex ${
      dark ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <Sidebar theme={theme} hasOwnerAccess={!!user} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className={`flex items-center justify-between px-6 py-4 border-b ${
          dark ? 'border-white/10' : 'border-gray-200'
        }`}>
          <h1 className={`text-xl font-semibold ${dark ? 'text-white' : 'text-gray-800'}`}>{title}</h1>

          <div className="flex items-center gap-3">
            {user && (
              <div className={`hidden sm:flex items-center gap-2 text-sm ${dark ? 'text-white/70' : 'text-gray-600'}`}>
                <span className="truncate max-w-[180px]">{user.email}</span>
                <button
                  onClick={onLogout}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg ${
                    dark ? 'hover:bg-white/10' : 'hover:bg-white/60'
                  }`}
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={toggleTheme}
              className={`p-2.5 rounded-full transition-all duration-300 ${
                dark
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow'
              }`}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
