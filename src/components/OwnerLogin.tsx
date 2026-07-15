import React, { useState } from 'react'
import { LogIn, UserPlus, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LoadingSpinner } from './LoadingSpinner'
import { Theme } from '../hooks/useTheme'

interface OwnerLoginProps {
  onBack: () => void
  onLoginSuccess: () => void
  theme: Theme
}

type Mode = 'signin' | 'signup'

export function OwnerLogin({ onBack, onLoginSuccess, theme }: OwnerLoginProps) {
  const [mode, setMode] = useState<Mode>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) {
          setError(error.message)
        } else if (data.session) {
          onLoginSuccess()
        } else {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
          if (signInError) setError(signInError.message)
          else onLoginSuccess()
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setError(error.message)
        else onLoginSuccess()
      }
    } catch (err) {
      console.error('Auth error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  return (
    <div className={`min-h-screen p-4 ${
      theme === 'dark'
        ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]'
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <div className="max-w-md mx-auto pt-8">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 mb-6 transition-colors ${
            theme === 'dark'
              ? 'text-white/80 hover:text-white'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Menu
        </button>

        <div className={`backdrop-blur-md rounded-2xl p-6 border ${
          theme === 'dark'
            ? 'bg-white/10 border-white/20'
            : 'bg-white/40 border-white/50'
        }`} style={{
          backdropFilter: 'blur(12px)',
          boxShadow: theme === 'dark'
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
        }}>
          <h2 className={`text-2xl font-bold mb-2 text-center ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            {mode === 'signup' ? 'Create Account' : 'Owner Portal Login'}
          </h2>
          <p className={`text-sm text-center mb-6 ${
            theme === 'dark' ? 'text-white/60' : 'text-gray-600'
          }`}>
            {mode === 'signup' ? 'Sign up with your email and a password.' : 'Sign in to access the owner portal.'}
          </p>

          {error && (
            <div className={`border rounded-xl p-3 mb-4 ${
              theme === 'dark'
                ? 'bg-red-500/20 border-red-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className={`text-sm text-center ${
                theme === 'dark' ? 'text-red-200' : 'text-red-600'
              }`}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="Enter your name"
                />
              </div>
            )}

            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="Enter your email"
                required
              />
            </div>

            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter your password'}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                  : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
              }`}
            >
              {loading ? (
                <LoadingSpinner size="sm" />
              ) : mode === 'signup' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading
                ? mode === 'signup' ? 'Creating Account...' : 'Signing In...'
                : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className={`mt-6 pt-4 border-t ${
            theme === 'dark' ? 'border-white/20' : 'border-gray-200'
          }`}>
            <p className={`text-sm text-center ${
              theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
                className={`font-medium underline-offset-2 hover:underline ${
                  theme === 'dark' ? 'text-white' : 'text-[#052635]'
                }`}
              >
                {mode === 'signup' ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
