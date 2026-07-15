import React from 'react'
import { Theme } from '../hooks/useTheme'

interface GlassCardProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  theme?: Theme
}

export function GlassCard({ children, onClick, className = '', disabled = false, theme = 'dark' }: GlassCardProps) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
        relative backdrop-blur-md rounded-2xl p-6 shadow-2xl transition-all duration-300 cursor-pointer
        ${theme === 'dark' 
          ? 'bg-white/10 border border-white/20 hover:bg-white/15 hover:border-white/30 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]' 
          : 'bg-white/40 border border-white/50 hover:bg-white/50 hover:border-white/60 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:translate-y-[-2px]'}
        ${className}
      `}
      style={{
        boxShadow: theme === 'dark' 
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
          : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      }}
    >
      <div className={`absolute inset-0 rounded-2xl pointer-events-none ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-white/15 to-transparent' 
          : 'bg-gradient-to-br from-white/60 to-transparent'
      }`} />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}