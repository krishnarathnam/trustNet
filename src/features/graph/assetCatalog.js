import {
  CarFront,
  Stethoscope,
  Landmark,
  Users,
  Server,
  Network,
  Zap,
} from 'lucide-react'

/** Upper bound for normalizing load → green/red gradient in nodes and minimap */
export const MAX_PACKETS_PER_SECOND_FOR_VIS = 100_000

export const assetCatalog = [
  {
    type: 'traffic',
    title: 'Traffic Management System',
    defaultPacketsPerSecond: 5_000,
    Icon: CarFront,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'healthcare',
    title: 'Healthcare Platform',
    defaultPacketsPerSecond: 8_000,
    Icon: Stethoscope,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'financial',
    title: 'Financial Services System',
    defaultPacketsPerSecond: 14_000,
    Icon: Landmark,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'citizen',
    title: 'Citizen Portal',
    defaultPacketsPerSecond: 4_000,
    Icon: Users,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'data_center',
    title: 'Data Center',
    defaultPacketsPerSecond: 11_000,
    Icon: Server,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'iot',
    title: 'IoT Sensor Network',
    defaultPacketsPerSecond: 20_000,
    Icon: Network,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'power_grid',
    title: 'Power Grid System',
    defaultPacketsPerSecond: 13_000,
    Icon: Zap,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
]

export function getAssetByType(type) {
  return assetCatalog.find((a) => a.type === type)
}
