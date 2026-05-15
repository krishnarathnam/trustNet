import { getIntrinsicTrust } from './assetCatalog'
import { computePeerTrustMetrics } from './peerTrust'

/** Structural / class trust below this → deeper multi-hop spread is allowed. */
export const SPREAD_TRUST_CUTOFF = 65

function nodeResistance(nodeId, nodes, metrics) {
  const node = nodes.find((n) => n.id === nodeId)
  const assetType = node?.data?.assetType ?? ''
  const intrinsic = getIntrinsicTrust(assetType)
  const peerTrust = metrics.get(nodeId)?.peerTrust ?? intrinsic
  return Math.max(intrinsic, peerTrust)
}

/**
 * Simulate spread when the attack moves to a single first-hop neighbor, then BFS
 * into lower-resistance assets. Returns how many non-seed nodes would be reached.
 */
function simulateSpreadReach(seeds, firstHopId, adj, nodes, metrics) {
  const seedSet = new Set(seeds)
  const compromised = new Set(seeds)
  compromised.add(firstHopId)

  const queue = [firstHopId]

  while (queue.length > 0) {
    const u = queue.shift()
    for (const { neighborId: v } of adj.get(u) ?? []) {
      if (compromised.has(v)) continue
      if (nodeResistance(v, nodes, metrics) >= SPREAD_TRUST_CUTOFF) continue
      compromised.add(v)
      queue.push(v)
    }
  }

  return compromised.size - seedSet.size
}

/**
 * Among direct neighbors of anomaly seeds, pick the one where spread reaches
 * the most downstream nodes (tie-break: lowest trust resistance, then higher degree).
 */
function pickPrimarySpreadTarget(seeds, adj, nodes, metrics) {
  const seedSet = new Set(seeds)
  /** @type {{ nodeId: string, edgeId: string, score: number, resistance: number, degree: number } | null} */
  let best = null

  for (const seed of seeds) {
    for (const { neighborId: v, edgeId } of adj.get(seed) ?? []) {
      if (seedSet.has(v)) continue

      const score = simulateSpreadReach(seeds, v, adj, nodes, metrics)
      const resistance = nodeResistance(v, nodes, metrics)
      const degree = metrics.get(v)?.degree ?? 0

      if (
        best === null ||
        score > best.score ||
        (score === best.score && resistance < best.resistance) ||
        (score === best.score &&
          resistance === best.resistance &&
          degree > best.degree)
      ) {
        best = { nodeId: v, edgeId, score, resistance, degree }
      }
    }
  }

  return best
}

/**
 * Spread from Isolation Forest anomaly seeds: surfaces only the single neighbor
 * where the attack can propagate the farthest (by simulated downstream reach).
 *
 * @param {{
 *   nodes: import('@xyflow/react').Node[]
 *   edges: import('@xyflow/react').Edge[]
 *   anomalyNodeIds: string[]
 *   peerMetrics?: Map<string, { peerTrust: number, degree: number }>
 * }} args
 */
export function computeAttackSpread({ nodes, edges, anomalyNodeIds, peerMetrics }) {
  const metrics = peerMetrics ?? computePeerTrustMetrics(nodes, edges)
  const nodeIds = new Set(nodes.map((n) => n.id))
  const seeds = anomalyNodeIds.filter((id) => nodeIds.has(id))

  if (seeds.length === 0) {
    return {
      compromisedNodeIds: [],
      spreadEdgeIds: [],
      primarySpreadNodeId: null,
      primarySpreadEdgeId: null,
    }
  }

  /** @type {Map<string, Array<{ neighborId: string, edgeId: string }>>} */
  const adj = new Map()
  for (const e of edges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source).push({ neighborId: e.target, edgeId: e.id })
    adj.get(e.target).push({ neighborId: e.source, edgeId: e.id })
  }

  const primary = pickPrimarySpreadTarget(seeds, adj, nodes, metrics)

  if (!primary) {
    return {
      compromisedNodeIds: [...seeds],
      spreadEdgeIds: [],
      primarySpreadNodeId: null,
      primarySpreadEdgeId: null,
    }
  }

  return {
    compromisedNodeIds: [...seeds, primary.nodeId],
    spreadEdgeIds: [primary.edgeId],
    primarySpreadNodeId: primary.nodeId,
    primarySpreadEdgeId: primary.edgeId,
  }
}
