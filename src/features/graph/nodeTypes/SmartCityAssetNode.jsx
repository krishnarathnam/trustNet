import { Handle, Position } from '@xyflow/react'
import { getAssetByType } from '../assetCatalog'
import { useHackSimulator } from '../hackSimulatorContext'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/** Attack simulator off: fixed green; PPS edits do not change node color. */
const NORMAL_NODE_STYLE = {
  base: '#22c55e',
  border: '#16a34a',
  bg: 'color-mix(in srgb, #22c55e 16%, transparent)',
}

const HACK_MUTED = {
  base: '#64748b',
  border: '#475569',
  bg: 'color-mix(in srgb, #64748b 18%, transparent)',
}

/** Attack mode: tampered / compromised traffic — red (not green). */
const HACK_TAMPERED = {
  base: '#ef4444',
  border: '#dc2626',
  bg: 'color-mix(in srgb, #ef4444 22%, transparent)',
}

const ppsFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

export default function SmartCityAssetNode(nodeProps) {
  const { id, data, selected } = nodeProps
  const asset = getAssetByType(data.assetType)
  const hack = useHackSimulator()
  const attackOn = hack != null && hack.active === true

  const baselinePps = clamp(
    Number.isFinite(Number(data.packetsPerSecond))
      ? Number(data.packetsPerSecond)
      : asset?.defaultPacketsPerSecond ?? 0,
    0,
    Number.MAX_SAFE_INTEGER
  )

  const displayPps = attackOn
    ? clamp(
        hack.nodeOverrides[id] !== undefined
          ? Number(hack.nodeOverrides[id])
          : baselinePps,
        0,
        Number.MAX_SAFE_INTEGER
      )
    : baselinePps

  const label = data.label ?? asset?.title ?? 'Untitled System'
  const Icon = asset?.Icon
  // Attack simulator off: green. On: grey unchanged, red if tampered.
  const { base, border, bg } = attackOn
    ? displayPps !== baselinePps
      ? HACK_TAMPERED
      : HACK_MUTED
    : NORMAL_NODE_STYLE

  const ppsLabel = ppsFormatter.format(displayPps)

  return (
    <div
      className={[
        'relative rounded-2xl border shadow-sm transition',
        selected
          ? 'ring-2 ring-slate-900/70 dark:ring-slate-100/80'
          : 'hover:shadow-md',
      ].join(' ')}
      style={{
        background: bg,
        borderColor: border,
      }}
    >
      <div className="p-3 flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl bg-white/60 dark:bg-slate-950/30 border border-white/60 dark:border-slate-800/70 flex items-center justify-center"
          style={{ color: base }}
          aria-hidden="true"
        >
          {Icon ? <Icon size={20} /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
            {label}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">Packets/s</div>
            <div
              className="text-xs font-semibold px-2 py-0.5 rounded-lg border tabular-nums"
              style={{
                background: `color-mix(in srgb, ${base} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${base} 35%, transparent)`,
                color: base,
              }}
            >
              {ppsLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Connect handles on each side */}
      <Handle
        type="target"
        position={Position.Top}
        id="top-in"
        isConnectable={true}
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-out"
        isConnectable={true}
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Right}
        id="right-in"
        isConnectable={true}
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        isConnectable={true}
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-in"
        isConnectable={true}
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-out"
        isConnectable={true}
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="left-in"
        isConnectable={true}
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-out"
        isConnectable={true}
        style={{ background: base, border: `2px solid ${bg}` }}
      />
    </div>
  )
}
