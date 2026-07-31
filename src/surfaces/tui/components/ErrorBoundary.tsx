// Error boundary: catches render errors and shows recovery UI.
// Inputs: children ReactNode. Outputs: normal render or error fallback.
// Invariant: writes error to stderr on catch; exits on unrecoverable.

import { Component } from 'react'
import type { ReactNode } from 'react'
import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    process.stderr.write(`[ERROR] ${error.message}\n`)
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Box marginBottom={1}>
            <Text color={colors.status.error} bold>ERROR</Text>
          </Box>
          <Text color={colors.text.primary}>{this.state.error.message}</Text>
          <Box marginTop={1}>
            <Text color={colors.text.muted} dimColor>press Ctrl-C to quit</Text>
          </Box>
        </Box>
      )
    }
    return this.props.children
  }
}
