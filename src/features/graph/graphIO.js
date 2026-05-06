import { MarkerType } from '@xyflow/react'
import { getAssetByType } from './assetCatalog'

export const GRAPH_IO_VERSION = 3
const LEGACY_GRAPH_IO_VERSION = 1
const GRAPH_IO_VERSION_2 = 2
const NODE_TYPE = 'smartCityAsset'
const EDGE_TYPE = 'directedLabeled'

/** v1 JSON used `risk` (0–100); used when `risk` is missing on import */
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
  const assetType = String(n.data?.assetType ?? '')
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
  const assetType = String(n.data?.assetType ?? '')
  const asset = getAssetByType(assetType)
  const riskFallback = LEGACY_DEFAULT_RISK_BY_TYPE[assetType] ?? 0
  const riskRaw = Number(n.data?.risk ?? riskFallback)
  const risk = Number.isFinite(riskRaw)
    ? Math.max(0, Math.min(100, riskRaw))
    : 0
  const packetsPerSecond = Math.round(risk * 1000)

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
}

/**
 * Clears prior work conceptually: returns parsed nodes/edges/viewport/hackSimulator
 * for a small realistic smart-city dependency graph (ingress → hub → sector systems).
 */
export function getDefaultCanvasState() {
  const nodes = [
    {
      id: 'def-iot',
      type: NODE_TYPE,
      position: { x: 40, y: 60 },
      data: {
        assetType: 'iot',
        label: 'IoT Sensor Network',
        packetsPerSecond: 22_000,
      },
    },
    {
      id: 'def-traffic',
      type: NODE_TYPE,
      position: { x: 40, y: 260 },
      data: {
        assetType: 'traffic',
        label: 'Traffic Management System',
        packetsPerSecond: 6_000,
      },
    },
    {
      id: 'def-citizen',
      type: NODE_TYPE,
      position: { x: 40, y: 460 },
      data: {
        assetType: 'citizen',
        label: 'Citizen Portal',
        packetsPerSecond: 5_000,
      },
    },
    {
      id: 'def-power',
      type: NODE_TYPE,
      position: { x: 360, y: 40 },
      data: {
        assetType: 'power_grid',
        label: 'Power Grid System',
        packetsPerSecond: 3_000,
      },
    },
    {
      id: 'def-dc',
      type: NODE_TYPE,
      position: { x: 380, y: 240 },
      data: {
        assetType: 'data_center',
        label: 'Municipal Data Center',
        packetsPerSecond: 18_000,
      },
    },
    {
      id: 'def-health',
      type: NODE_TYPE,
      position: { x: 760, y: 140 },
      data: {
        assetType: 'healthcare',
        label: 'Healthcare Platform',
        packetsPerSecond: 9_000,
      },
    },
    {
      id: 'def-finance',
      type: NODE_TYPE,
      position: { x: 760, y: 360 },
      data: {
        assetType: 'financial',
        label: 'Financial Services System',
        packetsPerSecond: 12_000,
      },
    },
  ]

  const edges = [
    {
      id: 'def-e-iot-dc',
      type: EDGE_TYPE,
      source: 'def-iot',
      target: 'def-dc',
      data: { label: 'Telemetry ingress', packetsPerSecond: 20_000 },
    },
    {
      id: 'def-e-traffic-dc',
      type: EDGE_TYPE,
      source: 'def-traffic',
      target: 'def-dc',
      data: { label: 'Signal / CCTV feeds', packetsPerSecond: 5_500 },
    },
    {
      id: 'def-e-citizen-dc',
      type: EDGE_TYPE,
      source: 'def-citizen',
      target: 'def-dc',
      data: { label: 'HTTPS / APIs', packetsPerSecond: 4_800 },
    },
    {
      id: 'def-e-power-dc',
      type: EDGE_TYPE,
      source: 'def-power',
      target: 'def-dc',
      data: { label: 'Critical facility power', packetsPerSecond: 2_500 },
    },
    {
      id: 'def-e-dc-health',
      type: EDGE_TYPE,
      source: 'def-dc',
      target: 'def-health',
      data: { label: 'EHR / clinical integration', packetsPerSecond: 8_500 },
    },
    {
      id: 'def-e-dc-finance',
      type: EDGE_TYPE,
      source: 'def-dc',
      target: 'def-finance',
      data: { label: 'Payments / treasury APIs', packetsPerSecond: 11_000 },
    },
  ]

  const viewport = { x: 0, y: 0, zoom: 0.72 }

  const serialized = serializeGraph({ nodes, edges, viewport })
  return parseGraphJson(
    JSON.stringify({
      ...serialized,
      hackSimulator: DEFAULT_HACK_SIMULATOR,
    })
  )
}

/**
 * @param {unknown} value
 * @param {string[]} nodeIds
 * @param {string[]} edgeIds
 * @returns {{ active: boolean, nodeOverrides: Record<string, number>, edgeOverrides: Record<string, number> }}
 */
export function sanitizeHackSimulator(value, nodeIds, edgeIds) {
  const nodeSet = new Set(nodeIds)
  const edgeSet = new Set(edgeIds)
  if (!isRecord(value)) {
    return {
      active: false,
      nodeOverrides: {},
      edgeOverrides: {},
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
  return { active, nodeOverrides, edgeOverrides }
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
    version !== GRAPH_IO_VERSION_2 &&
    version !== LEGACY_GRAPH_IO_VERSION
  ) {
    throw new Error(
      `Unsupported graph version. Expected ${GRAPH_IO_VERSION}, ${GRAPH_IO_VERSION_2}, or ${LEGACY_GRAPH_IO_VERSION}, got ${version}`
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
      version === GRAPH_IO_VERSION
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
  const hackSimulator = sanitizeHackSimulator(obj.hackSimulator, nodeIds, edgeIds)

  return { nodes, edges, viewport, hackSimulator }
}
