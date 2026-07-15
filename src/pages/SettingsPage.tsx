import { User } from '@supabase/supabase-js'
import { Theme } from '../hooks/useTheme'
import { GlassCard } from '../components/GlassCard'

interface SettingsPageProps {
  theme: Theme
  user: User | null
  onLogout: () => void
}

export function SettingsPage({ theme, user, onLogout }: SettingsPageProps) {
  const dark = theme === 'dark'

  return (
    <div className="max-w-xl">
      <h2 className={`text-2xl font-bold mb-6 ${dark ? 'text-white' : 'text-gray-800'}`}>Account</h2>

      <GlassCard theme={theme}>
        <div className="space-y-4">
          <div>
            <p className={`text-xs uppercase tracking-wide mb-1 ${dark ? 'text-white/50' : 'text-gray-500'}`}>
              Signed in as
            </p>
            <p className={`font-medium ${dark ? 'text-white' : 'text-gray-800'}`}>
              {user ? user.email : 'Not logged in'}
            </p>
          </div>

          {user && (
            <button
              onClick={onLogout}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                dark ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]' : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
              }`}
            >
              Log out
            </button>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
