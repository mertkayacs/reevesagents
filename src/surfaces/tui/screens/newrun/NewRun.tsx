// Wizard entry point. Wraps the wizard subtree and routes to the agent-run flow.

import { useEffect } from 'react'
import { Text } from 'ink'
import { Frame } from '../../components/Frame.js'
import { WizardProvider } from '../../contexts/WizardContext.js'
import { useRouter } from '../../router.js'

function NewRunInner() {
  const { replace } = useRouter()

  useEffect(() => {
    replace('NewRunBasics')
  }, [replace])

  return (
    <Frame breadcrumb={['ReevesAgents', 'New Run']}>
      <Text>Starting wizard...</Text>
    </Frame>
  )
}

export function NewRun() {
  return (
    <WizardProvider>
      <NewRunInner />
    </WizardProvider>
  )
}
