// Main content pane without border. Holds rows, sections, and other primitives.

import React from 'react'
import { Box } from 'ink'

interface Props {
  children: React.ReactNode
}

export function Primary({ children }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {children}
    </Box>
  )
}
