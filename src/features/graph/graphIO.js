import { MarkerType } from '@xyflow/react'
import { getAssetByType } from './assetCatalog'

export const GRAPH_IO_VERSION = 4
const GRAPH_IO_VERSION_3 = 3
const GRAPH_IO_VERSION_2 = 2
const LEGACY_GRAPH_IO_VERSION = 1
const NODE_TYPE = 'iotDevice'
const EDGE_TYPE = 'directedLabeled'

/** Maps pre-IoT catalog `assetType` strings to current IoT types (import / localStorage). */
const LEGACY_ASSET_TYPE_TO_IOT = {
  traffic: 'edge_gateway',
  healthcare: 'wearables_hub',
  financial: 'cloud_ingest',
  citizen: 'mqtt_broker',
  data_center: 'cloud_ingest',
  iot: 'env_sensor',
  power_grid: 'plc_controller',
}

function migrateLegacyAssetType(assetType) {
  const raw = String(assetType ?? '')
  return LEGACY_ASSET_TYPE_TO_IOT[raw] ?? raw
}

/** v1 JSON used `risk` (0–100); keyed by legacy `assetType` before migration */
const LEGACY_DEFAULT_RISK_BY_TYPE = {
  traffic: 25,
  healthcare: 35,
  financial: 55,
  citizen: 20,
  data_center: 40,
  iot: 65,
  power_grid: 45,
}

function clampNonNegative(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 0) return 0
  return num
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`Graph JSON: "${name}" must be an array`)
  return value
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeNodeDataV2(n) {
  if (!isRecord(n)) throw new Error('Invalid node entry')
  const rawAssetType = String(n.data?.assetType ?? '')
  const assetType = migrateLegacyAssetType(rawAssetType)
  const asset = getAssetByType(assetType)
  const defaultPps = asset?.defaultPacketsPerSecond ?? 0
  const packetsPerSecond = clampNonNegative(n.data?.packetsPerSecond ?? defaultPps)

  return {
    id: String(n.id),
    type: NODE_TYPE,
    position: { x: Number(n.position?.x ?? 0), y: Number(n.position?.y ?? 0) },
    data: {
      assetType,
      label: String(n.data?.label ?? asset?.title ?? 'Untitled System'),
      packetsPerSecond,
    },
  }
}

function normalizeNodeDataV1(n) {
  if (!isRecord(n)) throw new Error('Invalid node entry')
  const rawAssetType = String(n.data?.assetType ?? '')
  const riskFallback = LEGACY_DEFAULT_RISK_BY_TYPE[rawAssetType] ?? 0
  const riskRaw = Number(n.data?.risk ?? riskFallback)
  const risk = Number.isFinite(riskRaw)
    ? Math.max(0, Math.min(100, riskRaw))
    : 0
  const packetsPerSecond = Math.round(risk * 1000)
  const assetType = migrateLegacyAssetType(rawAssetType)
  const asset = getAssetByType(assetType)

  return {
    id: String(n.id),
    type: NODE_TYPE,
    position: { x: Number(n.position?.x ?? 0), y: Number(n.position?.y ?? 0) },
    data: {
      assetType,
      label: String(n.data?.label ?? asset?.title ?? 'Untitled System'),
      packetsPerSecond,
    },
  }
}

export function serializeGraph({ nodes, edges, viewport }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new Error('serializeGraph expects { nodes: Node[], edges: Edge[] }')
  }

  const safeNodes = nodes.map((n) => {
    const normalized = normalizeNodeDataV2(n)
    return {
      id: normalized.id,
      type: NODE_TYPE,
      position: normalized.position,
      data: {
        assetType: normalized.data.assetType,
        label: normalized.data.label,
        packetsPerSecond: normalized.data.packetsPerSecond,
      },
    }
  })

  const safeEdges = edges.map((e) => ({
    id: String(e.id),
    type: EDGE_TYPE,
    source: String(e.source),
    target: String(e.target),
    sourceHandle: e.sourceHandle ? String(e.sourceHandle) : null,
    targetHandle: e.targetHandle ? String(e.targetHandle) : null,
    markerEndType: 'arrowClosed',
    data: {
      label: String(e.data?.label ?? ''),
      packetsPerSecond: clampNonNegative(e.data?.packetsPerSecond ?? 0),
    },
  }))

  const safeViewport = viewport
    ? {
        x: Number(viewport.x ?? 0),
        y: Number(viewport.y ?? 0),
        zoom: Number(viewport.zoom ?? 1),
      }
    : { x: 0, y: 0, zoom: 1 }

  const nodeById = Object.fromEntries(safeNodes.map((n) => [n.id, n]))

  function endpoint(nodeId) {
    const n = nodeById[nodeId]
    return {
      nodeId,
      label: n?.data?.label ?? '',
      assetType: n?.data?.assetType ?? '',
      packetsPerSecond: n?.data?.packetsPerSecond ?? 0,
    }
  }

  const directedEdges = safeEdges.map((e) => ({
    edgeId: e.id,
    from: endpoint(e.source),
    to: endpoint(e.target),
    linkLabel: e.data.label,
    packetsPerSecondOnLink: e.data.packetsPerSecond,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }))

  const directedAdjacency = Object.fromEntries(
    safeNodes.map((n) => [n.id, { outgoing: [], incoming: [] }])
  )

  for (const arc of directedEdges) {
    const {
      edgeId,
      from,
      to,
      linkLabel,
      packetsPerSecondOnLink,
      sourceHandle,
      targetHandle,
    } = arc
    directedAdjacency[from.nodeId].outgoing.push({
      edgeId,
      toNodeId: to.nodeId,
      toLabel: to.label,
      toAssetType: to.assetType,
      linkLabel,
      packetsPerSecondOnLink,
      sourceHandle,
      targetHandle,
    })
    directedAdjacency[to.nodeId].incoming.push({
      edgeId,
      fromNodeId: from.nodeId,
      fromLabel: from.label,
      fromAssetType: from.assetType,
      linkLabel,
      packetsPerSecondOnLink,
      sourceHandle,
      targetHandle,
    })
  }

  const graph = {
    /** Explicit directed arcs: `from` → `to` (arrow follows this direction). */
    directedEdges,
    /** Per node: lists of who it sends to (`outgoing`) and who sends to it (`incoming`). */
    directedAdjacency,
    /** Flat list (same arcs as `directedEdges`) for simple consumers. */
    connections: directedEdges.map((arc) => ({
      edgeId: arc.edgeId,
      fromNodeId: arc.from.nodeId,
      toNodeId: arc.to.nodeId,
      fromLabel: arc.from.label,
      toLabel: arc.to.label,
      fromAssetType: arc.from.assetType,
      toAssetType: arc.to.assetType,
      linkLabel: arc.linkLabel,
      packetsPerSecondOnLink: arc.packetsPerSecondOnLink,
      sourceHandle: arc.sourceHandle,
      targetHandle: arc.targetHandle,
    })),
  }

  return {
    version: GRAPH_IO_VERSION,
    nodes: safeNodes,
    edges: safeEdges,
    viewport: safeViewport,
    graph,
  }
}

/** Attack simulator overlay: persisted next to the graph for anomaly-style comparison. */
export const DEFAULT_HACK_SIMULATOR = {
  active: false,
  nodeOverrides: {},
  edgeOverrides: {},
  nodeScenarioBaselines: undefined,
  edgeScenarioBaselines: undefined,
}

/**
 * Default canvas: compact field → edge → security → app/cloud tier (demo preset).
 */
export function getDefaultCanvasState() {
  const nodes = [
    {
      id: 'def-env',
      type: NODE_TYPE,
      position: { x: 24, y: 24 },
      data: {
        assetType: 'env_sensor',
        label: 'Environmental sensor',
        packetsPerSecond: 3_800,
      },
    },
    {
      id: 'def-cam',
      type: NODE_TYPE,
      position: { x: 24, y: 112 },
      data: {
        assetType: 'ip_camera',
        label: 'IP camera',
        packetsPerSecond: 9_200,
      },
    },
    {
      id: 'def-plc',
      type: NODE_TYPE,
      position: { x: 24, y: 200 },
      data: {
        assetType: 'plc_controller',
        label: 'Industrial PLC',
        packetsPerSecond: 4_200,
      },
    },
    {
      id: 'def-gw',
      type: NODE_TYPE,
      position: { x: 200, y: 112 },
      data: {
        assetType: 'edge_gateway',
        label: 'Edge gateway',
        packetsPerSecond: 12_000,
      },
    },
    {
      id: 'def-fw',
      type: NODE_TYPE,
      position: { x: 360, y: 48 },
      data: {
        assetType: 'firewall',
        label: 'Firewall',
        packetsPerSecond: 28_000,
      },
    },
    {
      id: 'def-lb',
      type: NODE_TYPE,
      position: { x: 360, y: 168 },
      data: {
        assetType: 'load_balancer',
        label: 'Load balancer',
        packetsPerSecond: 30_000,
      },
    },
    {
      id: 'def-api',
      type: NODE_TYPE,
      position: { x: 520, y: 24 },
      data: {
        assetType: 'api_gateway',
        label: 'API gateway',
        packetsPerSecond: 25_000,
      },
    },
    {
      id: 'def-app',
      type: NODE_TYPE,
      position: { x: 520, y: 112 },
      data: {
        assetType: 'app_server',
        label: 'Application server',
        packetsPerSecond: 22_000,
      },
    },
    {
      id: 'def-db',
      type: NODE_TYPE,
      position: { x: 520, y: 200 },
      data: {
        assetType: 'database_server',
        label: 'Database server',
        packetsPerSecond: 12_000,
      },
    },
    {
      id: 'def-cloud',
      type: NODE_TYPE,
      position: { x: 680, y: 24 },
      data: {
        assetType: 'cloud_ingest',
        label: 'Cloud ingest',
        packetsPerSecond: 18_000,
      },
    },
  ]

  const edges = [
    {
      id: 'def-e-env-gw',
      type: EDGE_TYPE,
      source: 'def-env',
      target: 'def-gw',
      data: { label: 'Sensor telemetry', packetsPerSecond: 3_500 },
    },
    {
      id: 'def-e-cam-gw',
      type: EDGE_TYPE,
      source: 'def-cam',
      target: 'def-gw',
      data: { label: 'Video uplink', packetsPerSecond: 8_800 },
    },
    {
      id: 'def-e-plc-gw',
      type: EDGE_TYPE,
      source: 'def-plc',
      target: 'def-gw',
      data: { label: 'OPC / Modbus', packetsPerSecond: 4_000 },
    },
    {
      id: 'def-e-gw-fw',
      type: EDGE_TYPE,
      source: 'def-gw',
      target: 'def-fw',
      data: { label: 'Northbound TLS', packetsPerSecond: 17_000 },
    },
    {
      id: 'def-e-fw-lb',
      type: EDGE_TYPE,
      source: 'def-fw',
      target: 'def-lb',
      data: { label: 'Policy allow', packetsPerSecond: 26_000 },
    },
    {
      id: 'def-e-lb-api',
      type: EDGE_TYPE,
      source: 'def-lb',
      target: 'def-api',
      data: { label: 'HTTP / gRPC', packetsPerSecond: 24_000 },
    },
    {
      id: 'def-e-api-app',
      type: EDGE_TYPE,
      source: 'def-api',
      target: 'def-app',
      data: { label: 'REST routing', packetsPerSecond: 21_000 },
    },
    {
      id: 'def-e-api-cloud',
      type: EDGE_TYPE,
      source: 'def-api',
      target: 'def-cloud',
      data: { label: 'Stream ingest', packetsPerSecond: 17_500 },
    },
    {
      id: 'def-e-app-db',
      type: EDGE_TYPE,
      source: 'def-app',
      target: 'def-db',
      data: { label: 'SQL queries', packetsPerSecond: 11_000 },
    },
  ]

  const viewport = { x: 40, y: 40, zoom: 1 }

  const serialized = serializeGraph({ nodes, edges, viewport })
  return parseGraphJson(
    JSON.stringify({
      ...serialized,
      hackSimulator: DEFAULT_HACK_SIMULATOR,
    })
  )
}

/**
 * If scenario is active but baseline snapshots are missing (legacy JSON), lock to current graph data.
 */
export function recoverScenarioBaselinesIfNeeded(sim, nodes, edges) {
  if (!sim.active || !isRecord(sim)) return sim
  const nodeLocks = sim.nodeScenarioBaselines
  const edgeLocks = sim.edgeScenarioBaselines
  const hasNodeLocks = isRecord(nodeLocks) && Object.keys(nodeLocks).length > 0
  const hasEdgeLocks = isRecord(edgeLocks) && Object.keys(edgeLocks).length > 0
  if (hasNodeLocks && hasEdgeLocks) return sim

  return {
    ...sim,
    nodeScenarioBaselines: hasNodeLocks
      ? nodeLocks
      : Object.fromEntries(
          nodes.map((n) => [n.id, clampNonNegative(n.data?.packetsPerSecond ?? 0)])
        ),
    edgeScenarioBaselines: hasEdgeLocks
      ? edgeLocks
      : Object.fromEntries(
          edges.map((e) => [e.id, clampNonNegative(e.data?.packetsPerSecond ?? 0)])
        ),
  }
}

/**
 * @param {unknown} value
 * @param {string[]} nodeIds
 * @param {string[]} edgeIds
 */
export function sanitizeHackSimulator(value, nodeIds, edgeIds) {
  const nodeSet = new Set(nodeIds)
  const edgeSet = new Set(edgeIds)
  if (!isRecord(value)) {
    return {
      active: false,
      nodeOverrides: {},
      edgeOverrides: {},
      nodeScenarioBaselines: undefined,
      edgeScenarioBaselines: undefined,
    }
  }
  const active = value.active === true
  const nodeOverrides = {}
  const edgeOverrides = {}
  if (isRecord(value.nodeOverrides)) {
    for (const [k, v] of Object.entries(value.nodeOverrides)) {
      const id = String(k)
      if (nodeSet.has(id)) nodeOverrides[id] = clampNonNegative(v)
    }
  }
  if (isRecord(value.edgeOverrides)) {
    for (const [k, v] of Object.entries(value.edgeOverrides)) {
      const id = String(k)
      if (edgeSet.has(id)) edgeOverrides[id] = clampNonNegative(v)
    }
  }

  const nodeScenarioBaselines = {}
  if (isRecord(value.nodeScenarioBaselines)) {
    for (const [k, v] of Object.entries(value.nodeScenarioBaselines)) {
      const id = String(k)
      if (nodeSet.has(id)) nodeScenarioBaselines[id] = clampNonNegative(v)
    }
  }
  const edgeScenarioBaselines = {}
  if (isRecord(value.edgeScenarioBaselines)) {
    for (const [k, v] of Object.entries(value.edgeScenarioBaselines)) {
      const id = String(k)
      if (edgeSet.has(id)) edgeScenarioBaselines[id] = clampNonNegative(v)
    }
  }

  return {
    active,
    nodeOverrides,
    edgeOverrides,
    nodeScenarioBaselines:
      Object.keys(nodeScenarioBaselines).length > 0 ? nodeScenarioBaselines : undefined,
    edgeScenarioBaselines:
      Object.keys(edgeScenarioBaselines).length > 0 ? edgeScenarioBaselines : undefined,
  }
}

/**
 * @param {{ nodes: unknown[], edges: unknown[], viewport: object, hackSimulator: { active: boolean, nodeOverrides: Record<string, number>, edgeOverrides: Record<string, number> } }} args
 */
export function buildCanvasPersistPayload({ nodes, edges, viewport, hackSimulator }) {
  return {
    ...serializeGraph({ nodes, edges, viewport }),
    hackSimulator: {
      active: hackSimulator.active === true,
      nodeOverrides: { ...hackSimulator.nodeOverrides },
      edgeOverrides: { ...hackSimulator.edgeOverrides },
      ...(hackSimulator.nodeScenarioBaselines &&
      Object.keys(hackSimulator.nodeScenarioBaselines).length > 0
        ? { nodeScenarioBaselines: { ...hackSimulator.nodeScenarioBaselines } }
        : {}),
      ...(hackSimulator.edgeScenarioBaselines &&
      Object.keys(hackSimulator.edgeScenarioBaselines).length > 0
        ? { edgeScenarioBaselines: { ...hackSimulator.edgeScenarioBaselines } }
        : {}),
    },
  }
}

export const CANVAS_GRAPH_STORAGE_KEY = 'smarthackathon.canvas.graph.v1'

export function loadPersistedGraph() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(CANVAS_GRAPH_STORAGE_KEY)
    if (!raw) return null
    return parseGraphJson(raw)
  } catch {
    return null
  }
}

export function persistGraphJson(jsonText) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CANVAS_GRAPH_STORAGE_KEY, jsonText)
  } catch {
    /* quota / private mode */
  }
}

export function parseGraphJson(jsonText) {
  let obj
  if (typeof jsonText === 'string') {
    obj = JSON.parse(jsonText)
  } else {
    obj = jsonText
  }

  if (!isRecord(obj)) throw new Error('Invalid graph JSON (expected an object)')

  const version = obj.version
  if (
    version !== GRAPH_IO_VERSION &&
    version !== GRAPH_IO_VERSION_3 &&
    version !== GRAPH_IO_VERSION_2 &&
    version !== LEGACY_GRAPH_IO_VERSION
  ) {
    throw new Error(
      `Unsupported graph version. Expected ${GRAPH_IO_VERSION}, ${GRAPH_IO_VERSION_3}, ${GRAPH_IO_VERSION_2}, or ${LEGACY_GRAPH_IO_VERSION}, got ${version}`
    )
  }

  const nodesArr = requireArray(obj.nodes, 'nodes')
  const edgesArr = requireArray(obj.edges, 'edges')

  const viewportObj = isRecord(obj.viewport) ? obj.viewport : null
  const viewport = viewportObj
    ? {
        x: Number(viewportObj.x ?? 0),
        y: Number(viewportObj.y ?? 0),
        zoom: Number(viewportObj.zoom ?? 1),
      }
    : { x: 0, y: 0, zoom: 1 }

  const normalizeNode =
    version === LEGACY_GRAPH_IO_VERSION ? normalizeNodeDataV1 : normalizeNodeDataV2

  const nodes = nodesArr.map((n) => normalizeNode(n))

  const edges = edgesArr.map((e) => {
    if (!isRecord(e)) throw new Error('Invalid edge entry')
    const edgePps =
      version === GRAPH_IO_VERSION || version === GRAPH_IO_VERSION_3
        ? clampNonNegative(e.data?.packetsPerSecond ?? 0)
        : 0
    return {
      id: String(e.id),
      type: EDGE_TYPE,
      source: String(e.source),
      target: String(e.target),
      sourceHandle: e.sourceHandle ? String(e.sourceHandle) : undefined,
      targetHandle: e.targetHandle ? String(e.targetHandle) : undefined,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        label: String(e.data?.label ?? ''),
        packetsPerSecond: edgePps,
      },
    }
  })

  const nodeIds = nodes.map((n) => n.id)
  const edgeIds = edges.map((e) => e.id)
  const rawHack = sanitizeHackSimulator(obj.hackSimulator, nodeIds, edgeIds)
  const hackSimulator = recoverScenarioBaselinesIfNeeded(rawHack, nodes, edges)

  return { nodes, edges, viewport, hackSimulator }
}
