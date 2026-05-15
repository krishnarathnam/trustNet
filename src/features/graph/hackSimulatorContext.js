import { createContext, useContext } from 'react'

/**
 * Compromise scenario + derived security scan (Isolation Forest + spread).
 *
 * @typedef {{
 *   active: boolean
 *   nodeOverrides?: Record<string, number>
 *   edgeOverrides?: Record<string, number>
 *   nodeScenarioBaselines?: Record<string, number>
 *   edgeScenarioBaselines?: Record<string, number>
 *   isolationScoresByNodeId?: Record<string, number>
 *   anomalyNodeIds?: string[]
 *   spreadEdgeIds?: string[]
 *   compromisedNodeIds?: string[]
 *   primarySpreadNodeId?: string | null
 *   primarySpreadEdgeId?: string | null
 * }} HackSimulatorContextValue
 */

export const HackSimulatorContext = createContext(null)

export function useHackSimulator() {
  return useContext(HackSimulatorContext)
}
