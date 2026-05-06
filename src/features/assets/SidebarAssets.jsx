import { assetCatalog } from '../graph/assetCatalog'

export default function SidebarAssets() {
  function handleDragStart(event, assetType) {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({ assetType })
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        Smart City Assets
      </div>

      <div className="space-y-2">
        {assetCatalog.map((asset) => (
          <div
            key={asset.type}
            draggable
            onDragStart={(e) => handleDragStart(e, asset.type)}
            title={asset.title}
            aria-label={`Add ${asset.title}`}
            className="group flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-3 hover:bg-white dark:hover:bg-slate-900 cursor-grab active:cursor-grabbing"
          >
            <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <asset.Icon size={20} className="text-slate-700 dark:text-slate-200" />
              <span className="sr-only">{asset.title}</span>
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{asset.title}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

