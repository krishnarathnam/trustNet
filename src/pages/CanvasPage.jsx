import SidebarAssets from '../features/assets/SidebarAssets'
import GraphCanvas from '../features/graph/GraphCanvas'
import InspectorPanel from '../features/inspector/InspectorPanel'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function CanvasPage({ forceDefaultOnMount = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const graphRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [hackModeActive, setHackModeActive] = useState(false)

  const onSelectionChange = useCallback(({ selectedNode, selectedEdge }) => {
    setSelectedNode(selectedNode)
    setSelectedEdge(selectedEdge)
  }, [])

  const onUpdateNodeData = useCallback((nodeId, patch) => {
    graphRef.current?.updateNodeData?.(nodeId, patch)
  }, [])

  const onUpdateEdgeData = useCallback((edgeId, patch) => {
    graphRef.current?.updateEdgeData?.(edgeId, patch)
  }, [])

  const onDeleteNodeById = useCallback((nodeId) => {
    graphRef.current?.deleteNodeById?.(nodeId)
  }, [])

  const onDeleteEdgeById = useCallback((edgeId) => {
    graphRef.current?.deleteEdgeById?.(edgeId)
  }, [])

  useEffect(() => {
    if (location.pathname !== '/default') return
    const id = window.requestAnimationFrame(() => {
      navigate('/', { replace: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [location.pathname, navigate])

  return (
    <div className="min-h-[100svh] bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="h-14 border-b border-slate-200/60 dark:border-slate-800/60 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-sm" />
          <div className="leading-tight">
            <div className="font-semibold">Smart City Dependency Canvas</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Drag assets, connect systems, export/import JSON.
            </div>
          </div>
        </div>
        <Link
          to="/dashboard"
          className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
        >
          Dashboard
        </Link>
      </header>

      <main className="h-[calc(100svh-56px)] flex">
        <aside className="w-72 border-r border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40 p-3 overflow-auto">
          <SidebarAssets />
        </aside>
        <section className="flex-1 min-w-0 bg-white dark:bg-slate-950">
          <GraphCanvas
            ref={graphRef}
            forceDefaultOnMount={forceDefaultOnMount}
            onSelectionChange={onSelectionChange}
            onHackModeChange={setHackModeActive}
          />
        </section>
        <aside className="w-80 border-l border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40 p-3 overflow-auto">
          <InspectorPanel
            hackModeActive={hackModeActive}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNodeData={onUpdateNodeData}
            onUpdateEdgeData={onUpdateEdgeData}
            onDeleteNodeById={onDeleteNodeById}
            onDeleteEdgeById={onDeleteEdgeById}
          />
        </aside>
      </main>
    </div>
  )
}
