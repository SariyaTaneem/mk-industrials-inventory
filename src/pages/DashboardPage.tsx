import { useNavigate } from 'react-router-dom'
import { Package, QrCode, Scissors, ChartBar as BarChart3, LogIn } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { Theme } from '../hooks/useTheme'
import { User } from '@supabase/supabase-js'

interface DashboardPageProps {
  theme: Theme
  user: User | null
}

export function DashboardPage({ theme, user }: DashboardPageProps) {
  const navigate = useNavigate()

  const cards = [
    {
      path: '/stock-in',
      icon: Package,
      title: 'Generate Barcode',
      desc: 'Add full sheets or remnant entries',
    },
    {
      path: '/items',
      icon: QrCode,
      title: 'Scan Barcode',
      desc: 'View item details and manage inventory',
    },
    {
      path: '/cut-pieces',
      icon: Scissors,
      title: 'Generate Barcode for Cut Pieces',
      desc: 'Remnant matching with image upload',
    },
    {
      path: '/visualizer',
      icon: BarChart3,
      title: 'Inventory Visualizer',
      desc: 'Cut planning & optimization tool',
    },
  ]

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h2 className={`text-2xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
          Welcome back
        </h2>
        <p className={theme === 'dark' ? 'text-white/70' : 'text-gray-600'}>
          Pick up where you left off, or jump into a task below.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {cards.map(card => (
          <GlassCard key={card.path} onClick={() => navigate(card.path)} theme={theme}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                theme === 'dark'
                  ? 'bg-gradient-to-r from-[#6B7178] to-[#D24B44]'
                  : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
              }`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`font-semibold text-lg mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  {card.title}
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>{card.desc}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {!user && (
        <div className={`border-t pt-6 ${theme === 'dark' ? 'border-white/20' : 'border-gray-200'}`}>
          <GlassCard onClick={() => navigate('/owner-login')} theme={theme}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                theme === 'dark'
                  ? 'bg-gradient-to-r from-[#D24B44] to-[#052635]'
                  : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
              }`}>
                <LogIn className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`font-semibold text-lg mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  Owner Login
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>
                  Access owner dashboard
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  )
}
