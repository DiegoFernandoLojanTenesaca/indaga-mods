import type { ClientModule } from 'claude-code'

type SliderProps = {
  level: number
  least: number
  most: number
  accent: string
  filled: string
  knob: string
  empty: string
}

type SliderState = {
  level: number
  isDragging: boolean
}

const Slider: ClientModule<SliderProps, SliderState> = (props, surface) => {
  const { Text } = surface.elements
  const columns = Math.max(2, surface.columns)
  const span = props.most - props.least
  const levelAt = (x: number) => Math.round(Math.min(1, Math.max(0, x / (columns - 1))) * span + props.least)
  const shown = surface.state?.isDragging ? surface.state.level : props.level
  surface.onPointer(event => {
    const isDragging = event.type === 'down' || (event.type === 'move' && event.button !== undefined)
    if (!isDragging && event.type !== 'up') return
    const level = levelAt(event.fine?.x ?? event.x)
    if (level !== surface.state?.level || !isDragging) surface.post({ level, isDone: !isDragging })
    surface.setState({ level, isDragging })
  })
  const knobAt = Math.round(((shown - props.least) / span) * (columns - 1))
  return (
    <Text mono wrap="truncate-end">
      <Text color={props.accent}>{props.filled.repeat(knobAt)}</Text>
      <Text color={props.accent}>{props.knob}</Text>
      <Text dimColor>{props.empty.repeat(columns - knobAt - 1)}</Text>
    </Text>
  )
}

export default Slider
