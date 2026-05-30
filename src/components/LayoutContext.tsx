import React, { createContext, useContext } from 'react'

const LayoutContext = createContext<{ columns?: number }>({})

export function LayoutProvider({ columns, children }: { columns: number; children: React.ReactNode }) {
  return (
    <LayoutContext.Provider value={{ columns }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayoutColumns(): number {
  return useContext(LayoutContext).columns ?? process.stdout.columns ?? 100
}

export function panelWidth(columns: number): number {
  return Math.max(1, columns)
}
