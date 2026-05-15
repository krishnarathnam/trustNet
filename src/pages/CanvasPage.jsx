import trustNetLogo from '../../logo/logo.png'
import SidebarAssets from '../features/assets/SidebarAssets'
import GraphCanvas from '../features/graph/GraphCanvas'
import { DEFAULT_HACK_SIMULATOR } from '../features/graph/graphIO'
import InspectorPanel from '../features/inspector/InspectorPanel'
import { PanelLeft, PanelRight } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const drawerBtn =
  'lg:hidden rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition'

export default function CanvasPage({ forceDefaultOnMount = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const graphRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [hackModeActive, setHackModeActive] = useState(false)
  const [hackSimulator, setHackSimulator] = useState(DEFAULT_HACK_SIMULATOR)
  const [graphTopology, setGraphTopology] = useState({ nodes: [], edges: [] })
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const onSelectionChange = useCallback(({ selectedNode, selectedEdge }) => {
    setSelectedNode(selectedNode)
    setSelectedEdge(selectedEdge)
    if (selectedNode || selectedEdge) {
      setInspectorOpen(true)
    }
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

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const close = () => {
      setAssetsOpen(false)
      setInspectorOpen(false)
    }
    const onChange = (e) => {
      if (e.matches) close()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!assetsOpen && !inspectorOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [assetsOpen, inspectorOpen])

  return (
    <div className="flex h-[100svh] flex-col overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 px-3 dark:border-slate-800/60 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <img
            src={trustNetLogo}
            alt="TrustNetAI"
            className="h-8 w-8 shrink-0 rounded-xl object-contain shadow-sm sm:h-9 sm:w-9"
          />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold text-sm sm:text-base">TrustNetAI</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={drawerBtn}
            aria-label="Open assets panel"
            aria-expanded={assetsOpen}
            onClick={() => {
              setInspectorOpen(false)
              setAssetsOpen((o) => !o)
            }}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={drawerBtn}
            aria-label="Open inspector panel"
            aria-expanded={inspectorOpen}
            onClick={() => {
              setAssetsOpen(false)
              setInspectorOpen((o) => !o)
            }}
          >
            <PanelRight className="h-4 w-4" />
          </button>
          <Link
            to="/dashboard"
            className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-900/40 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition sm:px-3 sm:py-2 sm:text-sm"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1">
        {(assetsOpen || inspectorOpen) && (
          <button
            type="button"
            aria-label="Close panel"
            className="fixed inset-0 top-14 z-30 bg-slate-950/40 lg:hidden"
            onClick={() => {
              setAssetsOpen(false)
              setInspectorOpen(false)
            }}
          />
        )}

        <aside
          className={[
            'fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85vw] overflow-auto border-r border-slate-200/60 bg-slate-50/40 p-3 transition-transform duration-200 ease-out dark:border-slate-800/60 dark:bg-slate-950/40',
            'lg:static lg:z-auto lg:max-w-none lg:shrink-0 lg:translate-x-0',
            assetsOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
        >
          <SidebarAssets />
        </aside>

        <section className="min-h-0 min-w-0 flex-1 bg-white dark:bg-slate-950">
          <GraphCanvas
            ref={graphRef}
            forceDefaultOnMount={forceDefaultOnMount}
            onSelectionChange={onSelectionChange}
            onHackModeChange={setHackModeActive}
            onHackSimulatorChange={setHackSimulator}
            onGraphTopology={setGraphTopology}
          />
        </section>

        <aside
          className={[
            'fixed top-14 bottom-0 right-0 z-40 w-80 max-w-[90vw] overflow-auto border-l border-slate-200/60 bg-slate-50/40 p-3 transition-transform duration-200 ease-out dark:border-slate-800/60 dark:bg-slate-950/40',
            'lg:static lg:z-auto lg:max-w-none lg:shrink-0 lg:translate-x-0',
            inspectorOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
          ].join(' ')}
        >
          <InspectorPanel
            hackModeActive={hackModeActive}
            hackSimulator={hackSimulator}
            allNodes={graphTopology.nodes}
            allEdges={graphTopology.edges}
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
