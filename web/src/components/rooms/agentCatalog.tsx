import { useMemo, useState } from 'react'
import type { AgentFlavor } from '@/components/rooms/roleTemplates'
import { getDefaultModelForAgent as getDefaultModelForSessionAgent, MODEL_OPTIONS } from '@/components/NewSession/types'

export type AgentModelOption = {
  value: string
  label: string
}

export const AGENT_OPTIONS: AgentFlavor[] = ['claude', 'codex', 'cursor', 'gemini', 'opencode']

export const AGENT_SHORT_CODES: Record<AgentFlavor, string> = {
  claude: 'cc',
  codex: 'cdx',
  cursor: 'cur',
  gemini: 'gem',
  opencode: 'oc',
}

export const AGENT_LABELS: Record<AgentFlavor, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  opencode: 'OpenCode',
}

export const AGENT_MODEL_OPTIONS: Record<AgentFlavor, AgentModelOption[]> = {
  claude: MODEL_OPTIONS.claude,
  codex: MODEL_OPTIONS.codex,
  cursor: MODEL_OPTIONS.cursor,
  gemini: MODEL_OPTIONS.gemini,
  opencode: MODEL_OPTIONS.opencode,
}

const AGENT_ICON_URLS: Record<AgentFlavor, string[]> = {
  claude: ['/agents/claude-app.jpg'],
  codex: ['/agents/codex-app.jpg'],
  cursor: ['/agents/cursor.png'],
  gemini: ['/agents/gemini.svg'],
  opencode: ['/agents/opencode.png'],
}

const AGENT_RING_CLASSES = [
  'bg-gradient-to-br from-sky-500 to-cyan-400',
  'bg-gradient-to-br from-violet-500 to-fuchsia-400',
  'bg-gradient-to-br from-emerald-500 to-lime-400',
  'bg-gradient-to-br from-amber-500 to-orange-400',
  'bg-gradient-to-br from-rose-500 to-pink-400',
  'bg-gradient-to-br from-indigo-500 to-blue-400',
]

export function getDefaultModelForAgent(agent: AgentFlavor): string {
  return getDefaultModelForSessionAgent(agent)
}

export function normalizeAgentFlavor(value: string | null | undefined, fallback: AgentFlavor = 'claude'): AgentFlavor {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return AGENT_OPTIONS.find((item) => item === normalized) ?? fallback
}

export function hashStringToIndex(value: string, modulo: number = AGENT_RING_CLASSES.length): number {
  if (modulo <= 0) return 0
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash % modulo
}

export function getAgentRingClass(index: number): string {
  return AGENT_RING_CLASSES[index % AGENT_RING_CLASSES.length] ?? AGENT_RING_CLASSES[0]
}

export function normalizeMentionKeyInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function modelValueToKey(agent: AgentFlavor, model: string): string {
  if (!model || model === 'auto') {
    return 'auto'
  }

  if (agent === 'claude' && (model === 'opus' || model === 'sonnet')) {
    return model
  }

  return model
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/([a-z])_([0-9])/g, '$1$2')
    .replace(/([0-9])_([0-9])/g, '$1_$2')
    .replace(/_+/g, '_')
    || 'auto'
}

export function buildMentionKeyBase(roleKey: string, agent: AgentFlavor, model: string): string {
  const rolePart = normalizeMentionKeyInput(roleKey) || 'agent'
  const agentPart = AGENT_SHORT_CODES[agent]
  const modelPart = modelValueToKey(agent, model)
  return `${rolePart}_${agentPart}_${modelPart}`
}

export function AgentAvatar(props: {
  agent: AgentFlavor
  ringIndex: number
  sizeClass?: string
  innerClassName?: string
}) {
  const [imageIndex, setImageIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const urls = useMemo(() => AGENT_ICON_URLS[props.agent] ?? [], [props.agent])
  const src = !failed ? urls[imageIndex] : undefined
  const ringClass = getAgentRingClass(props.ringIndex)
  const fallbackLabel = AGENT_SHORT_CODES[props.agent].toUpperCase()

  return (
    <div className={`inline-flex rounded-full p-[3px] shadow-sm ${ringClass}`}>
      <div className={`flex items-center justify-center overflow-hidden rounded-full bg-white ${props.sizeClass ?? 'h-11 w-11'} ${props.innerClassName ?? ''}`}>
        {src ? (
          <img
            src={src}
            alt={AGENT_LABELS[props.agent]}
            className="h-full w-full object-cover"
            onError={() => {
              if (imageIndex < urls.length - 1) {
                setImageIndex((current) => current + 1)
              } else {
                setFailed(true)
              }
            }}
          />
        ) : (
          <span className="text-xs font-semibold uppercase text-[var(--app-hint)]">{fallbackLabel}</span>
        )}
      </div>
    </div>
  )
}
