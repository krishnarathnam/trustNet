import { createContext, useContext } from 'react'

export const HackSimulatorContext = createContext(null)

export function useHackSimulator() {
  return useContext(HackSimulatorContext)
}
