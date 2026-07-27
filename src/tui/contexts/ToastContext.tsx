// Global toast queue. Screens call toast(msg, severity) instead of managing
// per-screen flashMsg/setTimeout pairs. Older ones expire silently.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type ToastSeverity = 'info' | 'success' | 'warn' | 'error'

export interface Toast {
  id: number
  text: string
  severity: ToastSeverity
  expires_at: number
}

interface ContextValue {
  current: Toast | null
  toast: (_text: string, _severity?: ToastSeverity) => void
  clear: () => void
}

const ToastContext = createContext<ContextValue | null>(null)
const AUTO_DISMISS_MS = 4000

export function useToast(): ContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Toast | null>(null)
  const counter = useRef(0)

  const toast = useCallback((text: string, severity: ToastSeverity = 'info') => {
    counter.current += 1
    setCurrent({ id: counter.current, text, severity, expires_at: Date.now() + AUTO_DISMISS_MS })
  }, [])

  const clear = useCallback(() => setCurrent(null), [])

  useEffect(() => {
    if (!current) return
    const ms = Math.max(0, current.expires_at - Date.now())
    const t = setTimeout(() => {
      setCurrent(prev => (prev && prev.id === current.id ? null : prev))
    }, ms)
    return () => clearTimeout(t)
  }, [current])

  return (
    <ToastContext.Provider value={{ current, toast, clear }}>
      {children}
    </ToastContext.Provider>
  )
}

import { colors } from '../utils/tokens.js'

export function severityColor(s: ToastSeverity): string {
  if (s === 'success') return colors.status.ok
  if (s === 'warn') return colors.status.warn
  if (s === 'error') return colors.status.error
  return colors.accent.bright
}
