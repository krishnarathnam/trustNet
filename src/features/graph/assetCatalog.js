import {
  Radio,
  Router,
  Zap,
  Camera,
  Activity,
  Cpu,
  CloudUpload,
  Server,
  Monitor,
  Database,
  Globe,
  Scale,
  Shield,
  HardDrive,
} from 'lucide-react'

/** Upper bound for normalizing load → green/red gradient in nodes and minimap */
export const MAX_PACKETS_PER_SECOND_FOR_VIS = 100_000

export const assetCatalog = [
  {
    type: 'env_sensor',
    title: 'Environmental sensor',
    defaultPacketsPerSecond: 3_500,
    intrinsicTrust: 58,
    Icon: Radio,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'smart_actuator',
    title: 'Smart actuator',
    defaultPacketsPerSecond: 2_000,
    intrinsicTrust: 72,
    Icon: Zap,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'edge_gateway',
    title: 'Edge gateway',
    defaultPacketsPerSecond: 12_000,
    intrinsicTrust: 88,
    Icon: Router,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'ip_camera',
    title: 'IP camera',
    defaultPacketsPerSecond: 9_000,
    intrinsicTrust: 70,
    Icon: Camera,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'wearables_hub',
    title: 'Wearables hub',
    defaultPacketsPerSecond: 6_500,
    intrinsicTrust: 65,
    Icon: Activity,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'plc_controller',
    title: 'Industrial PLC',
    defaultPacketsPerSecond: 4_500,
    intrinsicTrust: 82,
    Icon: Cpu,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'cloud_ingest',
    title: 'Cloud ingest',
    defaultPacketsPerSecond: 18_000,
    intrinsicTrust: 90,
    Icon: CloudUpload,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'mqtt_broker',
    title: 'MQTT broker',
    defaultPacketsPerSecond: 15_000,
    intrinsicTrust: 85,
    Icon: Server,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'app_server',
    title: 'Application server',
    defaultPacketsPerSecond: 22_000,
    intrinsicTrust: 86,
    Icon: Monitor,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'database_server',
    title: 'Database server',
    defaultPacketsPerSecond: 12_000,
    intrinsicTrust: 92,
    Icon: Database,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'api_gateway',
    title: 'API gateway',
    defaultPacketsPerSecond: 25_000,
    intrinsicTrust: 88,
    Icon: Globe,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'load_balancer',
    title: 'Load balancer',
    defaultPacketsPerSecond: 30_000,
    intrinsicTrust: 90,
    Icon: Scale,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'firewall',
    title: 'Firewall',
    defaultPacketsPerSecond: 28_000,
    intrinsicTrust: 94,
    Icon: Shield,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
  {
    type: 'object_storage',
    title: 'Object storage',
    defaultPacketsPerSecond: 16_000,
    intrinsicTrust: 89,
    Icon: HardDrive,
    handles: { in: ['top', 'left', 'right', 'bottom'], out: ['top', 'left', 'right', 'bottom'] },
  },
]

export function getAssetByType(type) {
  return assetCatalog.find((a) => a.type === type)
}

export function getIntrinsicTrust(assetType) {
  const asset = getAssetByType(assetType)
  return typeof asset?.intrinsicTrust === 'number' && Number.isFinite(asset.intrinsicTrust)
    ? Math.max(0, Math.min(100, asset.intrinsicTrust))
    : 50
}
