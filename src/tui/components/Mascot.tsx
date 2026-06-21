// Reeves the duck. Renders the pre-generated chafa output as multi-line ANSI.
// Variants come from `scripts/render-mascot.mjs` which converts duck.svg.

import React from 'react'
import { Box, Text } from 'ink'
import { DUCK_RENDERED, type DuckVariant } from '../brand/duck-rendered.js'

export type MascotVariant = 'hero' | 'duo' | 'single' | 'mini'
export type MascotShift = 'normal' | 'halfDown' | 'down'

interface Props {
  variant: MascotVariant
  shift?: MascotShift
}

function DuckRows({ artKey }: { artKey: DuckVariant }) {
  const rows = DUCK_RENDERED[artKey].split('\n')
  return (
    <Box flexDirection="column">
      {rows.map((row, idx) => (
        <Text key={`${artKey}-${idx}`}>{row}</Text>
      ))}
    </Box>
  )
}

function PadColumn({ rows }: { rows: number }) {
  return (
    <Box flexDirection="column">
      {Array.from({ length: rows }, (_, idx) => <Text key={idx}> </Text>)}
    </Box>
  )
}

function shiftedKey(variant: DuckVariant, shift: MascotShift): DuckVariant {
  if (shift === 'down') return `${variant}Down` as DuckVariant
  if (shift === 'halfDown') return `${variant}HalfDown` as DuckVariant
  return variant
}

export function Mascot({ variant, shift = 'normal' }: Props) {
  if (variant === 'mini') return <DuckRows artKey={shiftedKey('mini', shift)} />
  if (variant === 'single') return <DuckRows artKey={shiftedKey('single', shift)} />
  if (variant === 'hero') return <DuckRows artKey={shiftedKey('hero', shift)} />

  // duo: hero plus three ducklings trailing right, aligned to the hero's bottom.
  const heroRowCount = DUCK_RENDERED.hero.split('\n').length
  const ducklingRowCount = DUCK_RENDERED.duckling.split('\n').length
  const pad = Math.max(0, heroRowCount - ducklingRowCount)

  return (
    <Box flexDirection="row">
      <DuckRows artKey={shiftedKey('hero', shift)} />
      <Box marginLeft={1} flexDirection="column"><PadColumn rows={pad} /><DuckRows artKey={shiftedKey('duckling', shift)} /></Box>
      <Box marginLeft={1} flexDirection="column"><PadColumn rows={pad} /><DuckRows artKey={shiftedKey('duckling', shift)} /></Box>
      <Box marginLeft={1} flexDirection="column"><PadColumn rows={pad} /><DuckRows artKey={shiftedKey('duckling', shift)} /></Box>
    </Box>
  )
}
