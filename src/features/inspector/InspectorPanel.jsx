import { useMemo } from 'react'
import {
  getNodeTrustInsights,
  hasScenarioDrift,
  isAnomalyDetected,
  isScenarioCritical,
} from '../graph/peerTrust'

export default function InspectorPanel({
  hackModeActive = false,
  hackSimulator = null,
  allNodes = [],
  allEdges = [],
  selectedNode,
  selectedEdge,
  onUpdateNodeData,
  onUpdateEdgeData,
  onDeleteNodeById,
  onDeleteEdgeById,
}) {
  const sim = hackSimulator ?? { active: false }

  const nodeTrust = useMemo(() => {
    if (!selectedNode?.id) return null
    const baseline =
      typeof selectedNode.inspectorBaselinePps === 'number'
        ? selectedNode.inspectorBaselinePps
        : Number(selectedNode.data?.packetsPerSecond) || 0
    const effective = Number(selectedNode.data?.packetsPerSecond) || 0
    return getNodeTrustInsights({
      nodeId: selectedNode.id,
      nodes: allNodes,
      edges: allEdges,
      assetType: selectedNode.data?.assetType ?? '',
      baselinePps: baseline,
      effectivePps: effective,
      sim,
    })
  }, [selectedNode, allNodes, allEdges, sim])

  const nodeScenarioUi = useMemo(() => {
    if (!nodeTrust || !selectedNode) return null
    const baseline =
      typeof selectedNode.inspectorBaselinePps === 'number'
        ? selectedNode.inspectorBaselinePps
        : Number(selectedNode.data?.packetsPerSecond) || 0
    const effective = Number(selectedNode.data?.packetsPerSecond) || 0
    const drift = hasScenarioDrift({ baselinePps: baseline, effectivePps: effective })
    const anomalyFromScan =
      hackModeActive && (sim.anomalyNodeIds ?? []).includes(selectedNode.id)
    const anomalyDetected = anomalyFromScan || isAnomalyDetected(nodeTrust)
    const critical = isScenarioCritical({
      isAnomaly: anomalyDetected,
      trustAnomaly: anomalyDetected,
    })
    return { drift, critical, anomalyDetected }
  }, [nodeTrust, selectedNode, hackModeActive, sim.anomalyNodeIds])

  const threatLabel = useMemo(() => {
    if (!hackModeActive || !nodeTrust) return null
    if (nodeTrust.attackOrigin) return 'Attack origin'
    if (nodeTrust.spreadReached) return 'Spread target'
    if (nodeTrust.atRisk) return 'At risk'
    if (nodeScenarioUi?.anomalyDetected) return 'Anomaly'
    if (nodeScenarioUi?.drift && !nodeScenarioUi?.critical) return 'Drift'
    return null
  }, [hackModeActive, nodeTrust, nodeScenarioUi])

  return (
    <div className="h-full">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        Inspector
      </div>

      {hackModeActive ? (
        <div className="mt-2 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90">
          Compromise scenario: packet rate edits apply to the scenario only. Baseline is
          unchanged until you turn the scenario off and edit here.
        </div>
      ) : null}

      {!selectedNode && !selectedEdge ? (
        <div className="mt-3 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-4 text-sm text-slate-600 dark:text-slate-300">
          Select a node or an edge in the canvas to edit it.
        </div>
      ) : null}

      {selectedNode ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Node
          </div>

          <div className="mt-2 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-4 space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Label
              </div>
              <input
                type="text"
                value={selectedNode.data?.label ?? ''}
                onChange={(e) => onUpdateNodeData?.(selectedNode.id, { label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {hackModeActive
                  ? 'Packets per second (scenario)'
                  : 'Packets per second'}
              </div>
              <input
                type="number"
                min={0}
                step={100}
                value={
                  Number.isFinite(Number(selectedNode.data?.packetsPerSecond))
                    ? Number(selectedNode.data?.packetsPerSecond)
                    : 0
                }
                onChange={(e) =>
                  onUpdateNodeData?.(selectedNode.id, {
                    packetsPerSecond: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {nodeTrust ? (
              <div className="rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 px-3 py-2 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
                  <span>Trust score</span>
                  <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {Math.round(nodeTrust.trustScore)}%
                  </span>
                </div>
                {hackModeActive ? (
                  <>
                    <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
                      <span>Anomaly</span>
                      <span
                        className={
                          nodeScenarioUi?.anomalyDetected
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }
                      >
                        {nodeScenarioUi?.anomalyDetected ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {threatLabel ? (
                      <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
                        <span>Threat</span>
                        <span
                          className={
                            threatLabel === 'At risk'
                              ? 'font-semibold text-violet-700 dark:text-violet-400'
                              : 'font-semibold text-rose-700 dark:text-rose-400'
                          }
                        >
                          {threatLabel}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onDeleteNodeById?.(selectedNode.id)}
              className="w-full rounded-lg bg-rose-600 text-white text-sm py-2 hover:bg-rose-700"
            >
              Delete node
            </button>
          </div>
        </div>
      ) : null}

      {selectedEdge ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Edge
          </div>

          <div className="mt-2 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-4 space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Label
              </div>
              <input
                type="text"
                value={selectedEdge.data?.label ?? ''}
                onChange={(e) =>
                  onUpdateEdgeData?.(selectedEdge.id, { label: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {hackModeActive
                  ? 'Packets per second on link (scenario)'
                  : 'Packets per second (on this link)'}
              </div>
              <input
                type="number"
                min={0}
                step={100}
                value={
                  Number.isFinite(Number(selectedEdge.data?.packetsPerSecond))
                    ? Number(selectedEdge.data?.packetsPerSecond)
                    : 0
                }
                onChange={(e) =>
                  onUpdateEdgeData?.(selectedEdge.id, {
                    packetsPerSecond: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200/70 dark:border-slate-800/70 bg-white/80 dark:bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            {hackModeActive ? (
              <div className="rounded-lg border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2 text-slate-600 dark:text-slate-400">
                  <span>Link role</span>
                  <span
                    className={
                      hackSimulator?.primarySpreadEdgeId === selectedEdge.id
                        ? 'font-semibold text-rose-700 dark:text-rose-400'
                        : (hackSimulator?.atRiskEdgeIds ?? []).includes(selectedEdge.id)
                          ? 'font-semibold text-violet-700 dark:text-violet-400'
                          : 'text-slate-900 dark:text-slate-100'
                    }
                  >
                    {hackSimulator?.primarySpreadEdgeId === selectedEdge.id
                      ? 'Propagation'
                      : (hackSimulator?.atRiskEdgeIds ?? []).includes(selectedEdge.id)
                        ? 'Spread path'
                        : 'Normal'}
                  </span>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => onDeleteEdgeById?.(selectedEdge.id)}
              className="w-full rounded-lg bg-rose-600 text-white text-sm py-2 hover:bg-rose-700"
            >
              Delete edge
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
