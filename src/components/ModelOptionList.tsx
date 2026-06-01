import React from 'react'
import { Row } from './Row.js'
import { Section, SectionEnd } from './Section.js'
import { modelDisplayName } from '../launcher/model-catalog.js'
import { modelBadgeLabel, modelColor } from '../utils/display.js'
import type { Provider } from '../state/types.js'

interface Props {
  provider: Provider
  values: readonly string[]
  current: string
  selectedIdx: number
}

export function ModelOptionList({ provider, values, current, selectedIdx }: Props) {
  return (
    <>
      <Section label="Model Options" />
      {values.map((model, idx) => (
        <Row
          key={model || 'provider-default'}
          selected={selectedIdx === idx}
          primary={modelDisplayName(model)}
          badge={model ? { label: modelBadgeLabel(model), color: modelColor(model, provider) } : undefined}
          hint={model === current ? 'selected' : model ? 'available' : 'provider CLI default'}
        />
      ))}
      <SectionEnd />
    </>
  )
}
