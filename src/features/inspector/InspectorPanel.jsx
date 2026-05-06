export default function InspectorPanel({
  hackModeActive = false,
  selectedNode,
  selectedEdge,
  onUpdateNodeData,
  onUpdateEdgeData,
  onDeleteNodeById,
  onDeleteEdgeById,
}) {
  return (
    <div className="h-full">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        Inspector
      </div>

      {hackModeActive ? (
        <div className="mt-2 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-950 dark:text-amber-100/90">
          Attack simulator: packet rate edits apply to the attack scenario only. Baseline
          is unchanged until you turn attack simulator off and edit here.
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
                  ? 'Packets per second (attack scenario)'
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
                  ? 'Packets per second on link (attack scenario)'
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

