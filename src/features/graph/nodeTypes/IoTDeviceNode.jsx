import { useCallback, useMemo } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import { shallow } from 'zustand/shallow'
import { getAssetByType } from '../assetCatalog'
import { useHackSimulator } from '../hackSimulatorContext'
import {
  computeTrustScore,
  evaluateTrustAnomaly,
  hasScenarioDrift,
  isAnomalyDetected,
} from '../peerTrust'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

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

const HACK_TAMPERED = {
  base: '#ef4444',
  border: '#dc2626',
  bg: 'color-mix(in srgb, #ef4444 22%, transparent)',
}

const HACK_ATTACK_ORIGIN = {
  base: '#a855f7',
  border: '#9333ea',
  bg: 'color-mix(in srgb, #a855f7 22%, transparent)',
}

const HACK_DRIFT = {
  base: '#d97706',
  border: '#b45309',
  bg: 'color-mix(in srgb, #f59e0b 18%, transparent)',
}

const ppsFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

const trustFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})

export default function IoTDeviceNode(nodeProps) {
  const { id, data, selected } = nodeProps
  const asset = getAssetByType(data.assetType)
  const hack = useHackSimulator()
  const attackOn = hack != null && hack.active === true

  const lockedBaselineRaw =
    attackOn && hack?.nodeScenarioBaselines?.[id] !== undefined
      ? Number(hack.nodeScenarioBaselines[id])
      : null
  const lockedBaseline =
    lockedBaselineRaw !== null && Number.isFinite(lockedBaselineRaw) ? lockedBaselineRaw : null

  const baselinePps = clamp(
    lockedBaseline !== null
      ? lockedBaseline
      : Number.isFinite(Number(data.packetsPerSecond))
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

  const graphSlice = useStore(
    useCallback((state) => ({ nodes: state.nodes, edges: state.edges }), []),
    shallow
  )

  const sim = useMemo(
    () => ({
      active: hack?.active === true,
      nodeOverrides: hack?.nodeOverrides ?? {},
      edgeOverrides: hack?.edgeOverrides ?? {},
      nodeScenarioBaselines: hack?.nodeScenarioBaselines,
      edgeScenarioBaselines: hack?.edgeScenarioBaselines,
    }),
    [
      hack?.active,
      hack?.nodeOverrides,
      hack?.edgeOverrides,
      hack?.nodeScenarioBaselines,
      hack?.edgeScenarioBaselines,
    ]
  )

  const trustModel = useMemo(
    () => computeTrustScore(id, graphSlice.nodes, graphSlice.edges, sim),
    [id, graphSlice.nodes, graphSlice.edges, sim]
  )

  const anomaly = useMemo(() => {
    const ev = evaluateTrustAnomaly({
      nodeId: id,
      nodes: graphSlice.nodes,
      edges: graphSlice.edges,
      sim,
      baselinePps,
      effectivePps: displayPps,
      isolationScoresByNodeId: hack?.isolationScoresByNodeId,
    })
    const flaggedByScan =
      attackOn && (hack?.anomalyNodeIds ?? []).includes(id)
    if (flaggedByScan) {
      return { ...ev, isAnomaly: true, trustAnomaly: true }
    }
    return ev
  }, [
    id,
    graphSlice.nodes,
    graphSlice.edges,
    sim,
    baselinePps,
    displayPps,
    hack?.isolationScoresByNodeId,
    hack?.anomalyNodeIds,
    attackOn,
  ])

  const isPrimarySpreadTarget =
    attackOn && hack?.primarySpreadNodeId != null && hack.primarySpreadNodeId === id
  const isAnomalySeed = attackOn && anomaly.isAnomaly
  const isCriticalRed = isPrimarySpreadTarget || isAnomalySeed
  const atRiskNodeIds = hack?.atRiskNodeIds ?? []
  const isAtRisk =
    attackOn && !isCriticalRed && atRiskNodeIds.includes(id)

  const label = data.label ?? asset?.title ?? 'Untitled device'
  const Icon = asset?.Icon

  const drift = hasScenarioDrift({ baselinePps, effectivePps: displayPps })

  const { base, border, bg } = !attackOn
    ? NORMAL_NODE_STYLE
    : isCriticalRed
      ? HACK_TAMPERED
      : isAtRisk
        ? HACK_ATTACK_ORIGIN
        : !drift
          ? HACK_MUTED
          : HACK_DRIFT

  const ppsLabel = ppsFormatter.format(displayPps)
  const trustLabel = trustFormatter.format(trustModel.trustScore)
  const showAnomalyDetectedBadge = attackOn && isAnomalyDetected(anomaly)
  const showSpreadBadge = isPrimarySpreadTarget
  const showAtRiskBadge = isAtRisk

  return (
    <div
      className={[
        'relative rounded-2xl border shadow-sm transition min-w-[200px]',
        selected
          ? 'ring-2 ring-slate-900/70 dark:ring-slate-100/80'
          : 'hover:shadow-md',
      ].join(' ')}
      style={{
        background: bg,
        borderColor: border,
      }}
    >
      {showAnomalyDetectedBadge ? (
        <div className="pointer-events-none absolute -top-2 -right-2 z-10 max-w-[140px] rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold leading-tight text-amber-950 shadow text-center">
          Anomaly detected
        </div>
      ) : null}
      {showSpreadBadge ? (
        <div className="pointer-events-none absolute -top-2 left-2 z-10 max-w-[140px] rounded-md bg-rose-600 px-2 py-1 text-[10px] font-bold leading-tight text-white shadow text-center">
          Highest spread risk
        </div>
      ) : null}
      {showAtRiskBadge ? (
        <div className="pointer-events-none absolute -top-2 left-2 z-10 max-w-[120px] rounded-md bg-violet-600 px-2 py-1 text-[10px] font-bold leading-tight text-white shadow text-center">
          May be attacked
        </div>
      ) : null}

      <div className="p-3 flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl bg-white/60 dark:bg-slate-950/30 border border-white/60 dark:border-slate-800/70 flex items-center justify-center shrink-0"
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
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">Trust score</div>
            <div
              className="text-xs font-semibold px-2 py-0.5 rounded-lg border tabular-nums"
              style={{
                background: `color-mix(in srgb, ${base} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${base} 35%, transparent)`,
                color: base,
              }}
            >
              {trustLabel}%
            </div>
          </div>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        id="top-in"
        isConnectable
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-out"
        isConnectable
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Right}
        id="right-in"
        isConnectable
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        isConnectable
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-in"
        isConnectable
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-out"
        isConnectable
        style={{ background: base, border: `2px solid ${bg}` }}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="left-in"
        isConnectable
        style={{ background: border, border: `2px solid ${bg}` }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-out"
        isConnectable
        style={{ background: base, border: `2px solid ${bg}` }}
      />
    </div>
  )
}
