import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  MarkerType,
  Panel,
  useOnSelectionChange,
  useReactFlow,
} from '@xyflow/react'
import IoTDeviceNode from './nodeTypes/IoTDeviceNode'
import DirectedLabeledEdge from './edgeTypes/DirectedLabeledEdge'
import { getAssetByType } from './assetCatalog'
import { HackSimulatorContext } from './hackSimulatorContext'
import {
  buildCanvasPersistPayload,
  DEFAULT_HACK_SIMULATOR,
  getDefaultCanvasState,
  loadPersistedGraph,
  parseGraphJson,
  persistGraphJson,
} from './graphIO'
import { collectActiveAnomalies } from './peerTrust'

const NODE_TYPE = 'iotDevice'
const EDGE_TYPE = 'directedLabeled'

function clampNonNegative(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

function scenarioNodeBaseline(n, sim) {
  const live = Number.isFinite(Number(n.data?.packetsPerSecond))
    ? Number(n.data.packetsPerSecond)
    : 0
  if (sim.active !== true) return live
  const locked = sim.nodeScenarioBaselines?.[n.id]
  if (locked !== undefined && Number.isFinite(locked)) return locked
  return live
}

function scenarioEdgeBaseline(e, sim) {
  const live = Number.isFinite(Number(e.data?.packetsPerSecond))
    ? Number(e.data.packetsPerSecond)
    : 0
  if (sim.active !== true) return live
  const locked = sim.edgeScenarioBaselines?.[e.id]
  if (locked !== undefined && Number.isFinite(locked)) return locked
  return live
}

function mergeNodeForInspector(n, sim) {
  const baseline = scenarioNodeBaseline(n, sim)
  if (sim.active !== true) {
    return {
      ...n,
      inspectorBaselinePps: baseline,
    }
  }
  const override = sim.nodeOverrides[n.id]
  const effective = override !== undefined ? override : baseline
  return {
    ...n,
    inspectorBaselinePps: baseline,
    data: {
      ...n.data,
      packetsPerSecond: effective,
    },
  }
}

function mergeEdgeForInspector(e, sim) {
  if (sim.active !== true) return e
  const baseline = scenarioEdgeBaseline(e, sim)
  const override = sim.edgeOverrides[e.id]
  const effective = override !== undefined ? override : baseline
  return {
    ...e,
    data: {
      ...e.data,
      packetsPerSecond: effective,
    },
  }
}

function GraphCanvasInner({
  onSelectionChange,
  onHackModeChange,
  onHackSimulatorChange,
  onGraphTopology,
  controllerRef,
  forceDefaultOnMount = false,
}) {
  const reactFlowWrapper = useRef(null)
  const reactFlowInstanceRef = useRef(null)
  const pendingViewportRef = useRef(null)
  const skipNextPersistRef = useRef(false)

  const [snapToGrid, setSnapToGrid] = useState(false)
  const gridSize = 24

  const [exportOpen, setExportOpen] = useState(false)
  const [exportText, setExportText] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importError, setImportError] = useState('')

  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [hackSimulator, setHackSimulator] = useState(DEFAULT_HACK_SIMULATOR)
  const [persistReady, setPersistReady] = useState(false)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const hackSimulatorRef = useRef(hackSimulator)
  const selectionIdsRef = useRef({ nodeId: null, edgeId: null })

  nodesRef.current = nodes
  edgesRef.current = edges
  hackSimulatorRef.current = hackSimulator

  const securityScan = useMemo(
    () => collectActiveAnomalies(nodes, edges, hackSimulator),
    [nodes, edges, hackSimulator]
  )

  const [anomalyToast, setAnomalyToast] = useState(null)
  const anomalySigRef = useRef('')

  useEffect(() => {
    if (!hackSimulator.active) {
      anomalySigRef.current = ''
      setAnomalyToast(null)
      return
    }
    const sig = [
      ...securityScan.nodes.map((n) => `n:${n.id}`),
      ...securityScan.edges.map((e) => `e:${e.id}`),
    ]
      .sort()
      .join('|')
    if (!sig) {
      anomalySigRef.current = ''
      setAnomalyToast(null)
      return
    }
    if (sig !== anomalySigRef.current) {
      anomalySigRef.current = sig
      const nodeNames = securityScan.nodes.map((n) => n.label).filter(Boolean)
      const spreadSuffix = securityScan.primarySpreadNodeId
        ? ' — spread to highest-risk neighbor'
        : ''
      setAnomalyToast({
        detail:
          nodeNames.length > 0
            ? nodeNames.slice(0, 6).join(', ') +
              (nodeNames.length > 6 ? '…' : '') +
              spreadSuffix
            : spreadSuffix
              ? spreadSuffix.trim().replace(/^—\s*/, '')
              : undefined,
      })
    }
  }, [hackSimulator.active, securityScan])

  useEffect(() => {
    if (!anomalyToast) return undefined
    const id = window.setTimeout(() => setAnomalyToast(null), 14000)
    return () => window.clearTimeout(id)
  }, [anomalyToast])

  const hackContextValue = useMemo(
    () => ({
      active: hackSimulator.active === true,
      nodeOverrides: hackSimulator.nodeOverrides,
      edgeOverrides: hackSimulator.edgeOverrides,
      nodeScenarioBaselines: hackSimulator.nodeScenarioBaselines,
      edgeScenarioBaselines: hackSimulator.edgeScenarioBaselines,
      isolationScoresByNodeId: securityScan.isolationScoresByNodeId ?? {},
      anomalyNodeIds: securityScan.anomalyNodeIds ?? [],
      spreadEdgeIds: securityScan.spreadEdgeIds ?? [],
      compromisedNodeIds: securityScan.compromisedNodeIds ?? [],
      primarySpreadNodeId: securityScan.primarySpreadNodeId ?? null,
      primarySpreadEdgeId: securityScan.primarySpreadEdgeId ?? null,
    }),
    [
      hackSimulator.active,
      hackSimulator.nodeOverrides,
      hackSimulator.edgeOverrides,
      hackSimulator.nodeScenarioBaselines,
      hackSimulator.edgeScenarioBaselines,
      securityScan.isolationScoresByNodeId,
      securityScan.anomalyNodeIds,
      securityScan.spreadEdgeIds,
      securityScan.compromisedNodeIds,
      securityScan.primarySpreadNodeId,
      securityScan.primarySpreadEdgeId,
    ]
  )

  useLayoutEffect(() => {
    onHackSimulatorChange?.(hackContextValue)
  }, [hackContextValue, onHackSimulatorChange])

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const nodeTypes = useMemo(() => ({ [NODE_TYPE]: IoTDeviceNode }), [])
  const edgeTypes = useMemo(() => ({ [EDGE_TYPE]: DirectedLabeledEdge }), [])

  const onInit = useCallback((instance) => {
    reactFlowInstanceRef.current = instance
    const pending = pendingViewportRef.current
    if (pending) {
      instance.setViewport(pending, { duration: 0 })
      pendingViewportRef.current = null
    }
  }, [])

  const applyDefaultArchitectureState = useCallback(() => {
    const state = getDefaultCanvasState()
    setNodes(state.nodes)
    setEdges(state.edges)
    setHackSimulator(state.hackSimulator ?? DEFAULT_HACK_SIMULATOR)
    pendingViewportRef.current = state.viewport
    reactFlowInstanceRef.current?.setViewport?.(state.viewport, { duration: 400 })
    selectionIdsRef.current = { nodeId: null, edgeId: null }
    setAnomalyToast(null)
    skipNextPersistRef.current = true
    const payload = buildCanvasPersistPayload({
      nodes: state.nodes,
      edges: state.edges,
      viewport: state.viewport,
      hackSimulator: state.hackSimulator ?? DEFAULT_HACK_SIMULATOR,
    })
    persistGraphJson(JSON.stringify(payload))
    return state
  }, [])

  useEffect(() => {
    if (forceDefaultOnMount) {
      applyDefaultArchitectureState()
    } else {
      const loaded = loadPersistedGraph()
      if (loaded) {
        skipNextPersistRef.current = true
        setNodes(loaded.nodes)
        setEdges(loaded.edges)
        setHackSimulator(loaded.hackSimulator ?? DEFAULT_HACK_SIMULATOR)
        pendingViewportRef.current = loaded.viewport
      }
    }
    setPersistReady(true)
  }, [forceDefaultOnMount, applyDefaultArchitectureState])

  const persistCanvas = useCallback(() => {
    const instance = reactFlowInstanceRef.current
    const viewport = instance?.getViewport?.() ?? { x: 0, y: 0, zoom: 1 }
    const payload = buildCanvasPersistPayload({
      nodes,
      edges,
      viewport,
      hackSimulator,
    })
    persistGraphJson(JSON.stringify(payload))
  }, [nodes, edges, hackSimulator])

  const viewportPersistTimerRef = useRef(0)

  useEffect(() => {
    if (!persistReady) return
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }
    const handle = window.setTimeout(() => persistCanvas(), 400)
    return () => window.clearTimeout(handle)
  }, [nodes, edges, hackSimulator, persistReady, persistCanvas])

  const onMoveEnd = useCallback(() => {
    if (!persistReady) return
    window.clearTimeout(viewportPersistTimerRef.current)
    viewportPersistTimerRef.current = window.setTimeout(() => persistCanvas(), 500)
  }, [persistReady, persistCanvas])

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData('application/reactflow')
      if (!raw) return

      let payload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      const assetType = payload?.assetType
      const asset = getAssetByType(assetType)
      if (!asset) return

      const position = reactFlowInstanceRef.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode = {
        id: crypto.randomUUID(),
        type: NODE_TYPE,
        position: position ?? { x: 0, y: 0 },
        data: {
          assetType: asset.type,
          label: asset.title,
          packetsPerSecond: asset.defaultPacketsPerSecond ?? 0,
        },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [setNodes]
  )

  const onConnect = useCallback(
    (params) => {
      const newEdge = {
        id: crypto.randomUUID(),
        type: EDGE_TYPE,
        ...params,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { label: 'API', packetsPerSecond: 0 },
      }

      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const exportGraph = useCallback(() => {
    const instance = reactFlowInstanceRef.current
    if (!instance) return

    const obj = instance.toObject()
    const payload = buildCanvasPersistPayload({
      nodes,
      edges,
      viewport: obj.viewport,
      hackSimulator,
    })

    setExportText(JSON.stringify(payload, null, 2))
    setExportOpen(true)
  }, [edges, nodes, hackSimulator])

  const downloadExportGraph = useCallback(() => {
    if (!exportText) return

    const blob = new Blob([exportText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `iot-topology-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [exportText])

  const importGraph = useCallback((jsonText) => {
    const { nodes: nextNodes, edges: nextEdges, viewport, hackSimulator: rawHack } =
      parseGraphJson(jsonText)

    setNodes(nextNodes)
    setEdges(nextEdges)
    setHackSimulator(rawHack)

    reactFlowInstanceRef.current?.setViewport?.(viewport, { duration: 800 })
  }, [])

  const emitSelection = useCallback(() => {
    if (!onSelectionChange) return
    const { nodeId, edgeId } = selectionIdsRef.current
    const sim = hackSimulatorRef.current
    const n = nodeId ? nodesRef.current.find((x) => x.id === nodeId) : null
    const e = edgeId ? edgesRef.current.find((x) => x.id === edgeId) : null
    onSelectionChange({
      selectedNode: n ? mergeNodeForInspector(n, sim) : null,
      selectedEdge: e ? mergeEdgeForInspector(e, sim) : null,
    })
  }, [onSelectionChange])

  useEffect(() => {
    emitSelection()
  }, [nodes, edges, hackSimulator, emitSelection])

  useEffect(() => {
    onHackModeChange?.(hackSimulator.active === true)
  }, [hackSimulator.active, onHackModeChange])

  useEffect(() => {
    onGraphTopology?.({ nodes, edges })
  }, [nodes, edges, onGraphTopology])

  const updateNodeData = useCallback((nodeId, patch) => {
    const { label, packetsPerSecond, ...rest } = patch
    const hasLabel = Object.prototype.hasOwnProperty.call(patch, 'label')
    const hasPps = Object.prototype.hasOwnProperty.call(patch, 'packetsPerSecond')
    const hasRest = Object.keys(rest).length > 0

    if (hasRest) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...rest } } : n
        )
      )
    }

    if (hasLabel) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
        )
      )
    }

    if (hasPps) {
      const nextVal = clampNonNegative(packetsPerSecond)
      if (hackSimulatorRef.current.active === true) {
        const n = nodesRef.current.find((nn) => nn.id === nodeId)
        const sim = hackSimulatorRef.current
        const baseline = scenarioNodeBaseline(n ?? { id: nodeId, data: {} }, sim)
        setHackSimulator((sim) => {
          const nodeOverrides = { ...sim.nodeOverrides }
          if (nextVal === baseline) {
            delete nodeOverrides[nodeId]
          } else {
            nodeOverrides[nodeId] = nextVal
          }
          return { ...sim, nodeOverrides }
        })
      } else {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, packetsPerSecond: nextVal } }
              : n
          )
        )
        setHackSimulator((sim) => {
          if (!(nodeId in sim.nodeOverrides)) return sim
          const { [nodeId]: _, ...nodeOverrides } = sim.nodeOverrides
          return { ...sim, nodeOverrides }
        })
      }
    }
  }, [])

  const updateEdgeData = useCallback((edgeId, patch) => {
    const { label, packetsPerSecond, ...rest } = patch
    const hasLabel = Object.prototype.hasOwnProperty.call(patch, 'label')
    const hasPps = Object.prototype.hasOwnProperty.call(patch, 'packetsPerSecond')
    const hasRest = Object.keys(rest).length > 0

    if (hasRest) {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...e.data, ...rest } } : e
        )
      )
    }

    if (hasLabel) {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...e.data, label } } : e
        )
      )
    }

    if (hasPps) {
      const nextVal = clampNonNegative(packetsPerSecond)
      if (hackSimulatorRef.current.active === true) {
        const e = edgesRef.current.find((ee) => ee.id === edgeId)
        const sim = hackSimulatorRef.current
        const baseline = scenarioEdgeBaseline(e ?? { id: edgeId, data: {} }, sim)
        setHackSimulator((sim) => {
          const edgeOverrides = { ...sim.edgeOverrides }
          if (nextVal === baseline) {
            delete edgeOverrides[edgeId]
          } else {
            edgeOverrides[edgeId] = nextVal
          }
          return { ...sim, edgeOverrides }
        })
      } else {
        setEdges((eds) =>
          eds.map((e) =>
            e.id === edgeId
              ? { ...e, data: { ...e.data, packetsPerSecond: nextVal } }
              : e
          )
        )
        setHackSimulator((sim) => {
          if (!(edgeId in sim.edgeOverrides)) return sim
          const { [edgeId]: _, ...edgeOverrides } = sim.edgeOverrides
          return { ...sim, edgeOverrides }
        })
      }
    }
  }, [])

  const deleteNodeById = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setHackSimulator((sim) => {
      let next = { ...sim }
      if (nodeId in sim.nodeOverrides) {
        const { [nodeId]: _, ...nodeOverrides } = sim.nodeOverrides
        next = { ...next, nodeOverrides }
      }
      if (sim.nodeScenarioBaselines && nodeId in sim.nodeScenarioBaselines) {
        const { [nodeId]: __, ...nodeScenarioBaselines } = sim.nodeScenarioBaselines
        next = {
          ...next,
          nodeScenarioBaselines:
            Object.keys(nodeScenarioBaselines).length > 0
              ? nodeScenarioBaselines
              : undefined,
        }
      }
      return next
    })
  }, [])

  const deleteEdgeById = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    setHackSimulator((sim) => {
      let next = { ...sim }
      if (edgeId in sim.edgeOverrides) {
        const { [edgeId]: _, ...edgeOverrides } = sim.edgeOverrides
        next = { ...next, edgeOverrides }
      }
      if (sim.edgeScenarioBaselines && edgeId in sim.edgeScenarioBaselines) {
        const { [edgeId]: __, ...edgeScenarioBaselines } = sim.edgeScenarioBaselines
        next = {
          ...next,
          edgeScenarioBaselines:
            Object.keys(edgeScenarioBaselines).length > 0 ? edgeScenarioBaselines : undefined,
        }
      }
      return next
    })
  }, [])

  const toggleHackMode = useCallback(() => {
    setHackSimulator((s) => {
      const nextActive = !s.active
      if (!nextActive) {
        return {
          ...s,
          active: false,
          nodeOverrides: {},
          edgeOverrides: {},
          nodeScenarioBaselines: undefined,
          edgeScenarioBaselines: undefined,
        }
      }
      const nodeScenarioBaselines = Object.fromEntries(
        nodesRef.current.map((n) => [
          n.id,
          clampNonNegative(
            Number.isFinite(Number(n.data?.packetsPerSecond))
              ? Number(n.data.packetsPerSecond)
              : 0
          ),
        ])
      )
      const edgeScenarioBaselines = Object.fromEntries(
        edgesRef.current.map((e) => [
          e.id,
          clampNonNegative(
            Number.isFinite(Number(e.data?.packetsPerSecond))
              ? Number(e.data.packetsPerSecond)
              : 0
          ),
        ])
      )
      return {
        ...s,
        active: true,
        nodeScenarioBaselines,
        edgeScenarioBaselines,
      }
    })
  }, [])

  const resetAttackScenario = useCallback(() => {
    setHackSimulator((s) => ({
      ...s,
      nodeOverrides: {},
      edgeOverrides: {},
    }))
  }, [])

  useImperativeHandle(
    controllerRef,
    () => ({
      updateNodeData,
      updateEdgeData,
      deleteNodeById,
      deleteEdgeById,
    }),
    [deleteEdgeById, deleteNodeById, updateEdgeData, updateNodeData]
  )

  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes, edges: selectedEdges }) => {
      selectionIdsRef.current = {
        nodeId: selectedNodes[0]?.id ?? null,
        edgeId: selectedEdges[0]?.id ?? null,
      }
      emitSelection()
    },
  })

  const onImportClick = useCallback(() => {
    setImportError('')
    setImportOpen(true)
  }, [])

  const onImportFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        importGraph(text)
        setImportOpen(false)
      } catch (err) {
        setImportError(err?.message ?? 'Failed to import graph')
      } finally {
        e.target.value = ''
      }
    },
    [importGraph]
  )

  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow()

  const loadDefaultArchitecture = useCallback(() => {
    if (
      nodes.length > 0 &&
      !window.confirm('Replace current topology with the default architecture?')
    ) {
      return
    }
    applyDefaultArchitectureState()
    emitSelection()
    requestAnimationFrame(() => {
      fitView({ duration: 700, padding: 0.4, maxZoom: 1 })
    })
  }, [nodes.length, applyDefaultArchitectureState, emitSelection, fitView])

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 600 })
  }, [setViewport])

  return (
    <div className="h-full w-full relative">
      {anomalyToast ? (
        <div
          role="alert"
          className="fixed top-4 right-4 z-[120] max-w-sm rounded-xl border border-rose-200/90 bg-rose-50 px-4 py-3 shadow-lg dark:border-rose-900/60 dark:bg-rose-950/90 pointer-events-auto"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">
                Anomaly detected
              </div>
              {anomalyToast.detail ? (
                <div className="mt-1 text-xs text-rose-800/90 dark:text-rose-200/90 break-words">
                  {anomalyToast.detail}
                </div>
              ) : (
                <div className="mt-1 text-xs text-rose-800/90 dark:text-rose-200/90">
                  Isolation Forest flagged unusual behavior on the canvas.
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 rounded-md px-2 py-0.5 text-lg leading-none text-rose-700 hover:bg-rose-200/60 dark:text-rose-300 dark:hover:bg-rose-900/50"
              onClick={() => setAnomalyToast(null)}
            >
              ×
            </button>
          </div>
        </div>
      ) : null}
      <Panel
        position="top-left"
        className="m-3 p-2 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-950/60 shadow-sm flex items-center gap-2 pointer-events-none"
      >
        <label className="pointer-events-auto flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={snapToGrid}
            onChange={(e) => setSnapToGrid(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
          />
          Snap
        </label>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

        <button
          type="button"
          onClick={() => zoomOut()}
          className="pointer-events-auto h-8 px-2 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => zoomIn()}
          className="pointer-events-auto h-8 px-2 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => fitView({ duration: 700, padding: 0.2 })}
          className="pointer-events-auto h-8 px-3 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs hover:opacity-90"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto h-8 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
        >
          Reset
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

        <button
          type="button"
          onClick={exportGraph}
          className="pointer-events-auto h-8 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onImportClick}
          className="pointer-events-auto h-8 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
        >
          Import
        </button>
        <button
          type="button"
          onClick={loadDefaultArchitecture}
          title="Reset canvas to the built-in demo topology"
          className="pointer-events-auto h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          Default architecture
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

        <button
          type="button"
          onClick={toggleHackMode}
          className={[
            'pointer-events-auto h-8 px-3 rounded-lg text-xs font-medium transition',
            hackSimulator.active === true
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'border border-slate-200/70 dark:border-slate-800/70 hover:bg-slate-100/70 dark:hover:bg-slate-800/40',
          ].join(' ')}
        >
          {hackSimulator.active === true
            ? 'Compromise scenario on'
            : 'Compromise scenario'}
        </button>
        <button
          type="button"
          onClick={resetAttackScenario}
          disabled={
            Object.keys(hackSimulator.nodeOverrides).length === 0 &&
            Object.keys(hackSimulator.edgeOverrides).length === 0
          }
          className="pointer-events-auto h-8 px-2 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40 disabled:opacity-40 disabled:pointer-events-none"
          title="Clear scenario packet overrides (baseline unchanged)"
        >
          Reset scenario
        </button>
      </Panel>

      {exportOpen ? (
        <div className="absolute inset-0 z-50 bg-slate-950/40 flex items-start justify-center p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-950 shadow-xl mt-16">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 dark:border-slate-800/70">
              <div className="font-semibold text-slate-900 dark:text-slate-50">
                Export graph JSON
              </div>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="h-8 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
              >
                Close
              </button>
            </div>

            <textarea
              className="w-full h-64 px-4 py-3 font-mono text-[11px] bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-slate-100 outline-none"
              value={exportText}
              readOnly
            />

            <div className="px-4 py-3 flex items-center justify-end gap-2 border-t border-slate-200/70 dark:border-slate-800/70">
              <button
                type="button"
                onClick={downloadExportGraph}
                className="h-9 px-4 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm hover:opacity-90"
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                className="h-9 px-4 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-sm hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="absolute inset-0 z-50 bg-slate-950/40 flex items-start justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white dark:bg-slate-950 shadow-xl mt-16">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 dark:border-slate-800/70">
              <div className="font-semibold text-slate-900 dark:text-slate-50">
                Import graph JSON
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportOpen(false)
                  setImportError('')
                }}
                className="h-8 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
              >
                Close
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Choose a JSON file exported from this app.
              </div>

              <input
                type="file"
                accept="application/json"
                className="block w-full text-sm text-slate-600 dark:text-slate-300"
                onChange={onImportFileChange}
              />

              {importError ? (
                <div className="text-sm text-rose-600 dark:text-rose-400">
                  {importError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportOpen(false)
                    setImportError('')
                  }}
                  className="h-9 px-4 rounded-lg border border-slate-200/70 dark:border-slate-800/70 text-sm hover:bg-slate-100/70 dark:hover:bg-slate-800/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <HackSimulatorContext.Provider value={hackContextValue}>
        <div ref={reactFlowWrapper} className="h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={onInit}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onMoveEnd={onMoveEnd}
            onDrop={onDrop}
            onDragOver={onDragOver}
            snapToGrid={snapToGrid}
            snapGrid={[gridSize, gridSize]}
            deleteKeyCode={[]}
            fitView={false}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={gridSize} />
          </ReactFlow>
        </div>
      </HackSimulatorContext.Provider>
    </div>
  )
}

const GraphCanvas = memo(
  forwardRef(function GraphCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <GraphCanvasInner
          onSelectionChange={props.onSelectionChange}
          onHackModeChange={props.onHackModeChange}
          onHackSimulatorChange={props.onHackSimulatorChange}
          onGraphTopology={props.onGraphTopology}
          controllerRef={ref}
          forceDefaultOnMount={props.forceDefaultOnMount}
        />
      </ReactFlowProvider>
    )
  })
)

export default GraphCanvas

