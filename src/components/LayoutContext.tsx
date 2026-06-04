import React, { createContext, useContext } from 'react'

const LayoutContext = createContext<{ columns?: number; rows?: number }>({})

export function LayoutProvider({ columns, rows, children }: { columns: number; rows?: number; children: React.ReactNode }) {
  return (
    <LayoutContext.Provider value={{ columns, rows }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayoutColumns(): number {
  return useContext(LayoutContext).columns ?? process.stdout.columns ?? 100
}

export function useLayoutRows(): number {
  return useContext(LayoutContext).rows ?? process.stdout.rows ?? 24
}

export function panelWidth(columns: number): number {
  return Math.max(1, columns)
}
