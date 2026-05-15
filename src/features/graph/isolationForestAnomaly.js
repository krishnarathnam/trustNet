import { IsolationForest } from 'isolation-forest'
import { getIntrinsicTrust } from './assetCatalog'
import {
  computeBehavioralTrustComponent,
  computeDeviationMetrics,
  computeInteractionTrustComponent,
  computePeerTrustMetrics,
  getNodeBaselinePps,
  getNodeEffectivePps,
} from './peerTrust'

/**
 * Absolute IF score floor (large graphs). Small IoT graphs rarely exceed ~0.5
 * with this library — use relative ranking below.
 */
export const IF_ANOMALY_SCORE_THRESHOLD = 0.55

/** Relative detection for small graphs (typical hackathon canvas). */
export const IF_RELATIVE_MIN_SCORE = 0.3
export const IF_MIN_SCORE_GAP = 0.03
export const IF_MIN_SPREAD = 0.05

/** Minimum relative PPS change to count as a drift candidate (5%). */
export const IF_MIN_DEVIATION_RATIO = 0.05

const MIN_NODES_FOR_FIT = 3

/**
 * @param {import('@xyflow/react').Node} n
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {import('./peerTrust').HackSim | null | undefined} sim
 * @param {'baseline' | 'effective'} mode
 */
function buildNodeFeatureRow(n, nodes, edges, sim, mode) {
  const safeSim = sim ?? { active: false }
  const metrics = computePeerTrustMetrics(nodes, edges)
  const row = metrics.get(n.id)
  const assetType = n.data?.assetType ?? ''
  const intrinsicTrust = getIntrinsicTrust(assetType)
  const peerTrust = row?.peerTrust ?? intrinsicTrust
  const degree = row?.degree ?? 0
  const maxDegree = Math.max(1, ...[...metrics.values()].map((m) => m.degree))

  const baselinePps = getNodeBaselinePps(n, safeSim)
  const effectivePps =
    mode === 'baseline' ? baselinePps : getNodeEffectivePps(n, safeSim)

  const { deviationRatio: rawDeviation } = computeDeviationMetrics({
    baselinePps,
    effectivePps,
  })
  const behavioral = computeBehavioralTrustComponent({ baselinePps, effectivePps })
  const interaction = computeInteractionTrustComponent(n.id, nodes, edges, safeSim)

  const logDeviation = Math.log10(1 + rawDeviation)
  const effectivePpsNorm = Math.log10(Math.max(effectivePps, 1) + 1) / 6

  return {
    deviationLogNorm: Math.min(1, logDeviation / 2),
    ppsDeltaNorm: Math.min(1, logDeviation / 3),
    effectivePpsNorm: Math.min(1, effectivePpsNorm),
    peerTrustNorm: peerTrust / 100,
    degreeNorm: degree / maxDegree,
    intrinsicTrustNorm: intrinsicTrust / 100,
    behavioralNorm: behavioral / 100,
    interactionNorm: interaction / 100,
  }
}

/**
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {import('./peerTrust').HackSim | null | undefined} sim
 */
export function buildNodeFeatureMatrix(nodes, edges, sim, mode) {
  return nodes.map((n) => ({
    nodeId: n.id,
    features: buildNodeFeatureRow(n, nodes, edges, sim, mode),
  }))
}

/**
 * Classify anomalies from IF scores among nodes with scenario drift only.
 *
 * @param {number[]} scores
 * @param {boolean[]} hasScenarioDrift
 * @param {number[]} deviationRatios raw (uncapped) per node
 */
export function classifyIsolationScores(scores, hasScenarioDrift, deviationRatios) {
  if (scores.length === 0) return []

  const driftIndices = []
  for (let i = 0; i < scores.length; i++) {
    if (
      hasScenarioDrift[i] &&
      (deviationRatios[i] ?? 0) >= IF_MIN_DEVIATION_RATIO
    ) {
      driftIndices.push(i)
    }
  }

  if (driftIndices.length === 0) {
    return scores.map(() => false)
  }

  let bestIdx = driftIndices[0]
  let bestScore = scores[bestIdx]
  for (const i of driftIndices) {
    if (scores[i] > bestScore) {
      bestScore = scores[i]
      bestIdx = i
    }
  }

  const driftScores = driftIndices.map((i) => scores[i])
  const driftMax = Math.max(...driftScores)
  const driftMin = Math.min(...driftScores)
  const driftSpread = driftMax - driftMin
  const sortedDrift = [...driftScores].sort((a, b) => b - a)
  const driftGap = driftMax - (sortedDrift[1] ?? driftMin)

  return scores.map((score, i) => {
    if (i !== bestIdx) return false
    if (!hasScenarioDrift[i]) return false
    if ((deviationRatios[i] ?? 0) < IF_MIN_DEVIATION_RATIO) return false

    return (
      score >= IF_ANOMALY_SCORE_THRESHOLD ||
      score >= IF_RELATIVE_MIN_SCORE ||
      driftSpread >= IF_MIN_SPREAD ||
      driftGap >= IF_MIN_SCORE_GAP
    )
  })
}

/**
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {import('./peerTrust').HackSim | null | undefined} sim
 */
export function runIsolationForestAnomaly(nodes, edges, sim) {
  if (sim?.active !== true || nodes.length === 0) {
    return {
      isolationScoresByNodeId: {},
      anomalyNodeIds: [],
      nodeResults: [],
    }
  }

  const baselineMatrix = buildNodeFeatureMatrix(nodes, edges, sim, 'baseline')
  const effectiveMatrix = buildNodeFeatureMatrix(nodes, edges, sim, 'effective')

  const baselineRows = baselineMatrix.map((r) => r.features)
  const effectiveRows = effectiveMatrix.map((r) => r.features)

  const treeCount =
    baselineRows.length < MIN_NODES_FOR_FIT
      ? Math.min(50, Math.max(10, baselineRows.length * 10))
      : 100
  const subsample = Math.max(baselineRows.length, 1)

  const forest = new IsolationForest(treeCount, subsample)
  const scores =
    baselineRows.length > 0
      ? (forest.fit(baselineRows), forest.predict(effectiveRows))
      : []

  const scoreList = nodes.map((_, i) =>
    Number.isFinite(scores[i]) ? scores[i] : 0.5
  )
  const hasScenarioDrift = nodes.map((n) => {
    const baseline = getNodeBaselinePps(n, sim)
    const effective = getNodeEffectivePps(n, sim)
    return effective !== baseline
  })
  const deviationRatios = nodes.map((n) => {
    const baseline = getNodeBaselinePps(n, sim)
    const effective = getNodeEffectivePps(n, sim)
    return computeDeviationMetrics({ baselinePps: baseline, effectivePps: effective })
      .deviationRatio
  })

  const anomalyFlags =
    nodes.length < MIN_NODES_FOR_FIT
      ? classifySmallGraphFallback(scoreList, hasScenarioDrift, deviationRatios)
      : classifyIsolationScores(scoreList, hasScenarioDrift, deviationRatios)

  /** @type {Record<string, number>} */
  const isolationScoresByNodeId = {}
  /** @type {string[]} */
  const anomalyNodeIds = []
  /** @type {Array<{ id: string, label: string, isolationScore: number, isAnomaly: boolean }>} */
  const nodeResults = []

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const score = scoreList[i]
    const isAnomaly = anomalyFlags[i] === true

    isolationScoresByNodeId[n.id] = score
    if (isAnomaly) anomalyNodeIds.push(n.id)

    nodeResults.push({
      id: n.id,
      label: String(n.data?.label ?? n.id),
      isolationScore: score,
      isAnomaly,
    })
  }

  return { isolationScoresByNodeId, anomalyNodeIds, nodeResults }
}

/**
 * @param {number[]} scores
 * @param {boolean[]} hasScenarioDrift
 */
function classifySmallGraphFallback(scores, hasScenarioDrift, deviationRatios) {
  if (scores.length === 0) return []
  let max = -1
  let maxIdx = -1
  for (let i = 0; i < scores.length; i++) {
    if (!hasScenarioDrift[i]) continue
    if ((deviationRatios[i] ?? 0) < IF_MIN_DEVIATION_RATIO) continue
    if (scores[i] > max) {
      max = scores[i]
      maxIdx = i
    }
  }
  return scores.map((_, i) => i === maxIdx && maxIdx >= 0)
}

/**
 * @param {string} nodeId
 * @param {import('@xyflow/react').Node[]} nodes
 * @param {import('@xyflow/react').Edge[]} edges
 * @param {import('./peerTrust').HackSim | null | undefined} sim
 * @param {Record<string, number>} [scoresByNodeId]
 */
export function getNodeIsolationResult(nodeId, nodes, edges, sim, scoresByNodeId) {
  if (sim?.active !== true) {
    return { isolationScore: 0.5, isAnomaly: false }
  }

  const fullResult = scoresByNodeId
    ? null
    : runIsolationForestAnomaly(nodes, edges, sim)

  const scores = scoresByNodeId ?? fullResult?.isolationScoresByNodeId ?? {}
  const scoreList = nodes.map((n) => scores[n.id] ?? 0.5)
  const hasScenarioDrift = nodes.map((n) => {
    const baseline = getNodeBaselinePps(n, sim)
    const effective = getNodeEffectivePps(n, sim)
    return effective !== baseline
  })
  const deviationRatios = nodes.map((n) => {
    const baseline = getNodeBaselinePps(n, sim)
    const effective = getNodeEffectivePps(n, sim)
    return computeDeviationMetrics({ baselinePps: baseline, effectivePps: effective })
      .deviationRatio
  })

  if (Array.isArray(sim?.anomalyNodeIds)) {
    const idx = nodes.findIndex((n) => n.id === nodeId)
    return {
      isolationScore: idx >= 0 ? scoreList[idx] : 0.5,
      isAnomaly: sim.anomalyNodeIds.includes(nodeId),
    }
  }

  const anomalyFlags =
    nodes.length < MIN_NODES_FOR_FIT
      ? classifySmallGraphFallback(scoreList, hasScenarioDrift, deviationRatios)
      : classifyIsolationScores(scoreList, hasScenarioDrift, deviationRatios)

  const idx = nodes.findIndex((n) => n.id === nodeId)
  return {
    isolationScore: idx >= 0 ? scoreList[idx] : 0.5,
    isAnomaly: idx >= 0 ? anomalyFlags[idx] === true : false,
  }
}
