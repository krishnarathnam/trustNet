import { getIntrinsicTrust } from './assetCatalog'
import { computeAttackSpread } from './attackSpread'
import {
  getNodeIsolationResult,
  runIsolationForestAnomaly,
} from './isolationForestAnomaly'

const EPS = 1

/**
 * Compromise scenario state (matches GraphCanvas / HackSimulatorContext shape).
 * @typedef {{
 *   active?: boolean
 *   nodeOverrides?: Record<string, number>
 *   edgeOverrides?: Record<string, number>
 *   nodeScenarioBaselines?: Record<string, number>
 *   edgeScenarioBaselines?: Record<string, number>
 * }} HackSim
 */

/** Blend weights for composite trust score (intrinsic + topology + behavior + links). */
export const TRUST_SCORE_WEIGHT_INTRINSIC = 0.25
export const TRUST_SCORE_WEIGHT_STRUCTURAL_PEER = 0.3
export const TRUST_SCORE_WEIGHT_BEHAVIORAL = 0.25
export const TRUST_SCORE_WEIGHT_INTERACTION = 0.2

/** Relative PPS deviation at which the behavioral sub-score reaches zero (linear ramp). */
export const BEHAVIORAL_TRUST_FULL_PENALTY_RATIO = 0.35

/**
 * @param {{ baselinePps: number, effectivePps: number }} args
 * @returns {{ deviationRatio: number, deviationPercent: number, severeDeviation: boolean }}
 */
export function computeDeviationMetrics({ baselinePps, effectivePps }) {
  const baseline = Math.max(baselinePps, EPS)
  const deviationRatio = Math.abs(effectivePps - baselinePps) / baseline
  const deviationPercent = deviationRatio * 100
  return { deviationRatio, deviationPercent }
}

/**
 * Scenario baseline PPS for a node (matches GraphCanvas `scenarioNodeBaseline`).
 * @param {import('@xyflow/react').Node} n
 * @param {HackSim | null | undefined} sim
 */
export function getNodeBaselinePps(n, sim) {
  const live = Number.isFinite(Number(n.data?.packetsPerSecond))
    ? Number(n.data.packetsPerSecond)
    : 0
  if (sim?.active !== true) return live
  const locked = sim.nodeScenarioBaselines?.[n.id]
  if (locked !== undefined && Number.isFinite(locked)) return locked
  return live
}

/**
 * Live effective PPS for a node (scenario override when active).
 * @param {import('@xyflow/react').Node} n
 * @param {HackSim | null | undefined} sim
 */
export function getNodeEffectivePps(n, sim) {
  const baseline = getNodeBaselinePps(n, sim)
  if (sim?.active !== true) return baseline
  const o = sim.nodeOverrides?.[n.id]
  if (o !== undefined && Number.isFinite(o)) return o
  return baseline
}

/**
 * @param {import('@xyflow/react').Edge} e
 * @param {HackSim | null | undefined} sim
 */
export function getEdgeBaselinePps(e, sim) {
  const live = Number.isFinite(Number(e.data?.packetsPerSecond))
    ? Number(e.data.packetsPerSecond)
    : 0
  if (sim?.active !== true) return live
  const locked = sim.edgeScenarioBaselines?.[e.id]
  if (locked !== undefined && Number.isFinite(locked)) return locked
  return live
}

/**
 * @param {import('@xyflow/react').Edge} e
 * @param {HackSim | null | undefined} sim
 */
export function getEdgeEffectivePps(e, sim) {
  const baseline = getEdgeBaselinePps(e, sim)
  if (sim?.active !== true) return baseline
  const o = sim.edgeOverrides?.[e.id]
  if (o !== undefined && Number.isFinite(o)) return o
  return baseline
}

/**
 * @param {{ baselinePps: number, effectivePps: number }} args
 * @returns {number} 0–100; stable traffic → high, drift → low.
 */
export function computeBehavioralTrustComponent({ baselinePps, effectivePps }) {
  const { deviationRatio } = computeDeviationMetrics({ baselinePps, effectivePps })
  const t = Math.min(1, deviationRatio / BEHAVIORAL_TRUST_FULL_PENALTY_RATIO)
  return Math.max(0, Math.min(100, 100 * (1 - t)))
}

/**
 * Link consistency: edge throughput vs min(endpoint effective PPS).
 * @param {string} nodeId
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {HackSim | null | undefined} sim
 * @returns {number} 0–100; no incident edges → 100 (neutral).
 */
export function computeInteractionTrustComponent(nodeId, nodes, edges, sim) {
  const safeSim = sim ?? { active: false }
  const nodeIds = new Set(nodes.map((n) => n.id))
  const incident = edges.filter(
    (e) =>
      (e.source === nodeId || e.target === nodeId) &&
      nodeIds.has(e.source) &&
      nodeIds.has(e.target)
  )
  if (incident.length === 0) return 100

  let sum = 0
  for (const e of incident) {
    const src = nodes.find((x) => x.id === e.source)
    const tgt = nodes.find((x) => x.id === e.target)
    if (!src || !tgt) continue
    const se = getNodeEffectivePps(src, safeSim)
    const te = getNodeEffectivePps(tgt, safeSim)
    const cap = Math.max(EPS, Math.min(se, te))
    const edgeEff = getEdgeEffectivePps(e, safeSim)
    const a = edgeEff + EPS
    const b = cap + EPS
    const quality = Math.min(a, b) / Math.max(a, b)
    sum += quality
  }
  return Math.max(0, Math.min(100, (sum / incident.length) * 100))
}

/**
 * User-facing reliability score from class reputation, peer topology, traffic stability, and links.
 * Anomaly detection uses Isolation Forest via `evaluateTrustAnomaly`.
 * @param {string} nodeId
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {HackSim | null | undefined} sim
 */
export function computeTrustScore(nodeId, nodes, edges, sim) {
  const safeSim = sim ?? { active: false }
  const node = nodes.find((x) => x.id === nodeId)
  const assetType = node?.data?.assetType ?? ''
  const intrinsicTrust = getIntrinsicTrust(assetType)
  const metrics = computePeerTrustMetrics(nodes, edges)
  const row = metrics.get(nodeId)
  const peerTrustStructural = row?.peerTrust ?? intrinsicTrust
  const degree = row?.degree ?? 0

  const baselinePps = node ? getNodeBaselinePps(node, safeSim) : 0
  const effectivePps = node ? getNodeEffectivePps(node, safeSim) : 0
  const behavioralComponent = computeBehavioralTrustComponent({ baselinePps, effectivePps })
  const interactionComponent = computeInteractionTrustComponent(nodeId, nodes, edges, safeSim)

  const raw =
    TRUST_SCORE_WEIGHT_INTRINSIC * intrinsicTrust +
    TRUST_SCORE_WEIGHT_STRUCTURAL_PEER * peerTrustStructural +
    TRUST_SCORE_WEIGHT_BEHAVIORAL * behavioralComponent +
    TRUST_SCORE_WEIGHT_INTERACTION * interactionComponent

  const trustScore = Math.round(Math.max(0, Math.min(100, raw)))

  return {
    trustScore,
    peerTrustStructural,
    behavioralComponent,
    interactionComponent,
    intrinsicTrust,
    degree,
    baselinePps,
    effectivePps,
  }
}

/**
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @returns {Map<string, { peerTrust: number, degree: number }>}
 */
export function computePeerTrustMetrics(nodes, edges) {
  const nodeIds = new Set(nodes.map((n) => n.id))
  /** @type {Map<string, Set<string>>} */
  const neighbors = new Map()

  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set())
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set())
    neighbors.get(e.source).add(e.target)
    neighbors.get(e.target).add(e.source)
  }

  /** @type {Map<string, { peerTrust: number, degree: number }>} */
  const metrics = new Map()

  for (const n of nodes) {
    const peerSet = neighbors.get(n.id)
    const degree = peerSet ? peerSet.size : 0
    const assetType = n.data?.assetType ?? ''
    const selfTrust = getIntrinsicTrust(assetType)

    let peerTrust
    if (!peerSet || peerSet.size === 0) {
      peerTrust = selfTrust
    } else {
      let sum = 0
      for (const nid of peerSet) {
        const peer = nodes.find((x) => x.id === nid)
        sum += getIntrinsicTrust(peer?.data?.assetType ?? '')
      }
      peerTrust = sum / peerSet.size
    }

    metrics.set(n.id, { peerTrust, degree })
  }

  return metrics
}

/**
 * Anomaly detection via Isolation Forest (compromise scenario only).
 * @param {{
 *   nodeId: string
 *   nodes: import('@xyflow/react').Node[]
 *   edges: import('@xyflow/react').Edge[]
 *   sim?: HackSim | null
 *   baselinePps: number
 *   effectivePps: number
 *   isolationScoresByNodeId?: Record<string, number>
 * }} args
 */
export function evaluateTrustAnomaly({
  nodeId,
  nodes,
  edges,
  sim,
  baselinePps,
  effectivePps,
  isolationScoresByNodeId,
}) {
  const { deviationRatio, deviationPercent } = computeDeviationMetrics({
    baselinePps,
    effectivePps,
  })

  const { isolationScore, isAnomaly } =
    sim?.active === true
      ? getNodeIsolationResult(nodeId, nodes, edges, sim, isolationScoresByNodeId)
      : { isolationScore: 0.5, isAnomaly: false }

  return {
    deviationRatio,
    deviationPercent,
    isolationScore,
    isAnomaly,
    trustAnomaly: isAnomaly,
  }
}

/** Critical UI (red): Isolation Forest anomaly. */
export function isScenarioCritical({ isAnomaly, trustAnomaly }) {
  return isAnomaly === true || trustAnomaly === true
}

/** User-facing "anomaly" = Isolation Forest flagged. */
export function isAnomalyDetected(anomaly) {
  return anomaly?.isAnomaly === true || anomaly?.trustAnomaly === true
}

/**
 * Nodes / edges currently in an anomaly state under the compromise scenario.
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {{ active: boolean, nodeOverrides?: Record<string, number>, edgeOverrides?: Record<string, number>, nodeScenarioBaselines?: Record<string, number>, edgeScenarioBaselines?: Record<string, number> }} sim
 */
export function collectActiveAnomalies(nodes, edges, sim) {
  if (!sim?.active) {
    return {
      nodes: [],
      edges: [],
      anomalyNodeIds: [],
      spreadEdgeIds: [],
      compromisedNodeIds: [],
      primarySpreadNodeId: null,
      primarySpreadEdgeId: null,
      isolationScoresByNodeId: {},
    }
  }

  const ifResult = runIsolationForestAnomaly(nodes, edges, sim)
  const spread = computeAttackSpread({
    nodes,
    edges,
    anomalyNodeIds: ifResult.anomalyNodeIds,
  })

  const spreadSet = new Set(spread.spreadEdgeIds)
  const nodeHits = ifResult.nodeResults
    .filter((r) => r.isAnomaly)
    .map((r) => ({
      id: r.id,
      label: r.label,
      isolationScore: r.isolationScore,
      isAnomaly: true,
    }))

  const edgeHits = edges
    .filter((e) => spreadSet.has(e.id))
    .map((e) => ({
      id: e.id,
      label: String(e.data?.label ?? e.id),
      onSpreadPath: true,
    }))

  return {
    nodes: nodeHits,
    edges: edgeHits,
    anomalyNodeIds: ifResult.anomalyNodeIds,
    spreadEdgeIds: spread.spreadEdgeIds,
    compromisedNodeIds: spread.compromisedNodeIds,
    primarySpreadNodeId: spread.primarySpreadNodeId ?? null,
    primarySpreadEdgeId: spread.primarySpreadEdgeId ?? null,
    isolationScoresByNodeId: ifResult.isolationScoresByNodeId,
  }
}

/** Any scenario value different from baseline (for drift / amber tier). */
export function hasScenarioDrift({ baselinePps, effectivePps }) {
  return effectivePps !== baselinePps
}

/**
 * @param {{
 *   nodeId: string
 *   nodes: import('@xyflow/react').Node[]
 *   edges: import('@xyflow/react').Edge[]
 *   assetType: string
 *   baselinePps: number
 *   effectivePps: number
 *   sim?: HackSim | null
 * }} args
 */
export function getNodeTrustInsights({
  nodeId,
  nodes,
  edges,
  assetType,
  baselinePps,
  effectivePps,
  sim,
}) {
  const metrics = computePeerTrustMetrics(nodes, edges)
  const row = metrics.get(nodeId)
  const peerTrust = row?.peerTrust ?? getIntrinsicTrust(assetType)
  const degree = row?.degree ?? 0
  const intrinsicTrust = getIntrinsicTrust(assetType)
  const ifResult =
    sim?.active === true ? runIsolationForestAnomaly(nodes, edges, sim) : null
  const spread =
    sim?.active === true && ifResult
      ? computeAttackSpread({
          nodes,
          edges,
          anomalyNodeIds: ifResult.anomalyNodeIds,
        })
      : null

  const anomaly = evaluateTrustAnomaly({
    nodeId,
    nodes,
    edges,
    sim,
    baselinePps,
    effectivePps,
    isolationScoresByNodeId: ifResult?.isolationScoresByNodeId,
  })

  if (sim?.active === true && Array.isArray(sim.anomalyNodeIds)) {
    const flagged = sim.anomalyNodeIds.includes(nodeId)
    anomaly.isAnomaly = flagged
    anomaly.trustAnomaly = flagged
  }

  const trustModel = computeTrustScore(nodeId, nodes, edges, sim ?? { active: false })
  const compromisedSet = new Set(spread?.compromisedNodeIds ?? [])
  const spreadEdgeSet = new Set(spread?.spreadEdgeIds ?? [])

  return {
    intrinsicTrust,
    peerTrust,
    degree,
    trustScore: trustModel.trustScore,
    behavioralComponent: trustModel.behavioralComponent,
    interactionComponent: trustModel.interactionComponent,
    ...anomaly,
    spreadReached: compromisedSet.has(nodeId) && !anomaly.isAnomaly,
    onSpreadPath: [...spreadEdgeSet].some((eid) => {
      const edge = edges.find((e) => e.id === eid)
      return edge && (edge.source === nodeId || edge.target === nodeId)
    }),
  }
}
