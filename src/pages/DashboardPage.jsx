import { Link } from 'react-router-dom'

const kpis = [
  { label: 'Provisioned devices', value: '2.4K', hint: 'Across 18 sites' },
  { label: 'Avg packets/s', value: '842K', hint: 'Rolling 5 min' },
  { label: 'Trust alerts', value: '2', hint: 'Peer anomaly rules' },
  { label: 'Gateway uptime', value: '99.97%', hint: '30-day edge SLA' },
]

const trafficSeries = [42, 55, 48, 62, 71, 68, 75, 82, 78, 88, 91, 86]

const systemsTable = [
  { name: 'Edge gateway fleet', status: 'Healthy', pps: '1.2M' },
  { name: 'MQTT broker cluster', status: 'Degraded', pps: '640K' },
  { name: 'Environmental sensors', status: 'Healthy', pps: '380K' },
  { name: 'IP camera edge uplink', status: 'Healthy', pps: '2.1M' },
  { name: 'PLC / SCADA bridges', status: 'Healthy', pps: '510K' },
]

const dailyReport = {
  dateLabel: 'Friday, April 11, 2026',
  generatedAt: '23:45 local',
  summary: [
    'Northbound TLS from site gateways stayed within SLO; no broker partition events.',
    'Wearables hub firmware rollout completed; peer trust scores normalized within 2 h.',
    'Site 12 camera ingest showed a short burst; anomaly rules cleared after auto re-auth.',
  ],
  stats: [
    { label: 'Telemetry events ingested', value: '48.2M' },
    { label: 'Mean edge latency', value: '118 ms' },
    { label: 'Failed device handshakes', value: '1,024' },
    { label: 'Automated quarantines', value: '17' },
  ],
}

function TrafficChart({ series }) {
  const w = 320
  const h = 120
  const pad = 8
  const max = Math.max(...series, 1)
  const step = (w - pad * 2) / Math.max(series.length - 1, 1)
  const points = series.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - ((v / max) * (h - pad * 2))
    return `${x},${y}`
  })
  const d = `M ${points.join(' L ')}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full max-w-md h-32 text-indigo-500 dark:text-indigo-400"
      aria-hidden
    >
      <defs>
        <linearGradient id="dashLineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`}
        fill="url(#dashLineGrad)"
      />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BarSparkline({ values }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex gap-1.5 h-28 items-stretch" aria-hidden>
      {values.map((v, i) => {
        const pct = Math.max(6, (v / max) * 100)
        return (
          <div
            key={i}
            className="flex min-h-0 min-w-0 flex-1 flex-col justify-end"
          >
            <div
              className="w-full rounded-full bg-fuchsia-500/70 dark:bg-fuchsia-400/50"
              style={{ height: `${pct}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardPage() {
  const spark = [12, 18, 14, 22, 19, 26, 24, 28, 31, 27, 33, 30]

  return (
    <div className="min-h-[100svh] overflow-x-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 px-3 dark:border-slate-800/60 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-sm sm:h-9 sm:w-9" />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold text-sm sm:text-base">Operations dashboard</div>
            <div className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
              Dummy metrics — IoT fleet & trust overview
            </div>
          </div>
        </div>
        <Link
          to="/"
          className="shrink-0 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-900/40 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition sm:px-3 sm:py-2 sm:text-sm"
        >
          Canvas
        </Link>
      </header>

      <main className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/30 p-4"
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {k.label}
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{k.hint}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-5">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Network traffic (sample)
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Relative load index over the last 12 intervals
            </p>
            <div className="mt-4">
              <TrafficChart series={trafficSeries} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-5">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Event throughput
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Dummy bar sparkline for ingest volume
            </p>
            <div className="mt-6">
              <BarSparkline values={spark} />
            </div>
            <div className="mt-3 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>00:00</span>
              <span>Now</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Daily report
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                End-of-day operations summary (dummy)
              </p>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {dailyReport.dateLabel} · {dailyReport.generatedAt}
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
            {dailyReport.summary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {dailyReport.stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30 px-3 py-3"
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {s.label}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/60 dark:bg-slate-900/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/60 dark:border-slate-800/60">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Devices snapshot
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Reported packets per second (illustrative)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50/80 dark:bg-slate-950/40">
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Packets/s</th>
                </tr>
              </thead>
              <tbody>
                {systemsTable.map((row) => (
                  <tr
                    key={row.name}
                    className="border-t border-slate-200/50 dark:border-slate-800/50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.name}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          row.status === 'Healthy'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
                        ].join(' ')}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {row.pps}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
