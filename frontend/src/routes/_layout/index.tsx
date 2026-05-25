import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  TrendingUp,
  Zap,
} from "lucide-react"
import { FilesService } from "@/client"
import useAuth from "@/hooks/useAuth"
import useCurrency from "@/hooks/useCurrency"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [{ title: "MyAudit - Dashboard" }],
  }),
})

// ─── Gradient KPI Card (Purple Admin style) ───────────────────────────────────
interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  gradient: "danger" | "info" | "success" | "warning" | "primary"
  link?: string
}

const GRADIENTS: Record<KPICardProps["gradient"], string> = {
  danger:
    "from-[#ffbf96] to-[#fe7096] dark:from-[#c0392b]/80 dark:to-[#8e1a2e]/80",
  info: "from-[#90caf9] to-[#047edf] dark:from-[#1565c0]/80 dark:to-[#0d47a1]/80",
  success:
    "from-[#84d9d2] to-[#07cdae] dark:from-[#00695c]/80 dark:to-[#004d40]/80",
  warning:
    "from-[#f6d365] to-[#fda085] dark:from-[#e65100]/80 dark:to-[#bf360c]/80",
  primary:
    "from-[#da8cff] to-[#9a55ff] dark:from-[#6a0dad]/80 dark:to-[#4a0080]/80",
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  link,
}: KPICardProps) {
  const card = (
    <div
      className={`relative overflow-hidden bg-gradient-to-r ${GRADIENTS[gradient]} rounded-xl p-6 text-white shadow-md transition-all duration-200 ${link ? "cursor-pointer hover:shadow-xl hover:scale-[1.02]" : ""}`}
    >
      <div className="absolute right-0 top-0 size-32 rounded-full bg-white/10 translate-x-8 -translate-y-8" />
      <div className="absolute right-4 top-6 size-16 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-white/80 mb-2">
            {title}
          </p>
          <p className="text-3xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-white/70 mt-2">{subtitle}</p>}
        </div>
        <Icon className="size-8 text-white/60 mt-1" />
      </div>
    </div>
  )
  return link ? <Link to={link}>{card}</Link> : card
}

// ─── Section Card wrapper ─────────────────────────────────────────────────────
function SectionCard({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-white dark:bg-[#1e1e2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 ${className}`}
    >
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-semibold text-gray-800 dark:text-white">
          {title}
        </h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

// ─── Pure SVG Bar Chart (zero deps) ──────────────────────────────────────────
interface BarDatum {
  label: string
  count: number
  color: string
}

function SvgBarChart({ data }: { data: BarDatum[] }) {
  const W = 480
  const H = 200
  const PADDING = { top: 12, right: 12, bottom: 36, left: 32 }
  const innerW = W - PADDING.left - PADDING.right
  const innerH = H - PADDING.top - PADDING.bottom

  const maxVal = Math.max(...data.map((d) => d.count), 1)
  // Round up to a nice ceiling
  const yMax = Math.ceil(maxVal / 5) * 5 || 5
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i))

  const barWidth = Math.min(48, (innerW / data.length) * 0.55)
  const step = innerW / data.length

  const yPos = (val: number) => innerH - (val / yMax) * innerH

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-[200px]"
      aria-label="Bar chart"
    >
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {/* Grid lines + Y-axis labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={0}
              y1={yPos(tick)}
              x2={innerW}
              y2={yPos(tick)}
              stroke="#e5e7eb"
              strokeDasharray="3 3"
            />
            <text
              x={-6}
              y={yPos(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="#9ca3af"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = Math.max((d.count / yMax) * innerH, d.count > 0 ? 2 : 0)
          const x = step * i + step / 2 - barWidth / 2
          const y = innerH - barH
          const r = 4
          return (
            <g key={d.label}>
              {/* Rounded top bar via path */}
              <path
                d={
                  barH > r
                    ? `M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barWidth - r},${y} Q${x + barWidth},${y} ${x + barWidth},${y + r} L${x + barWidth},${y + barH} L${x},${y + barH} Z`
                    : `M${x},${y} L${x + barWidth},${y} L${x + barWidth},${y + barH} L${x},${y + barH} Z`
                }
                fill={d.color}
                opacity={0.9}
              />
              {/* Value label on top */}
              {d.count > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#6b7280"
                  fontWeight="600"
                >
                  {d.count}
                </text>
              )}
              {/* X-axis label */}
              <text
                x={x + barWidth / 2}
                y={innerH + 16}
                textAnchor="middle"
                fontSize={11}
                fill="#6b7280"
              >
                {d.label}
              </text>
            </g>
          )
        })}

        {/* X baseline */}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#e5e7eb" />
      </g>
    </svg>
  )
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const CHART_COLORS = [
  "#9a55ff",
  "#07cdae",
  "#fe7096",
  "#fda085",
  "#047edf",
  "#f6d365",
]

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const { user: currentUser } = useAuth()
  const { baseCurrency, formatAmountCompact } = useCurrency()

  const { data: docs, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  const documents = docs?.data || []

  // KPIs
  const totalReconciled = documents.length
  const pendingReviews = documents.filter(
    (d) => d.workflow_status === "PENDING_ACTION",
  ).length
  const exceptionCases = documents.filter(
    (d) => d.workflow_status === "EXCEPTION_APPROVED",
  ).length
  const highRiskAlerts = documents.filter((d) => d.risk_level === "HIGH").length
  const approvedCount = documents.filter(
    (d) => d.workflow_status === "APPROVED",
  ).length
  const matchedDocs = documents.filter((d) => d.ai_result === "MATCHED").length
  const autoMatchRate =
    documents.length > 0
      ? Math.round((matchedDocs / documents.length) * 100)
      : 0
  const totalAmount = documents.reduce(
    (sum, d) => sum + (d.base_amount || d.original_amount || 0),
    0,
  )

  const needsAttention = documents
    .filter(
      (d) =>
        d.workflow_status === "PENDING_ACTION" ||
        d.risk_level === "HIGH" ||
        d.ai_result === "UNMATCHED",
    )
    .slice(0, 5)

  const recentActivity = [...documents]
    .sort(
      (a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
    )
    .slice(0, 5)

  // AI Insights
  const aiInsights: { type: string; message: string; severity: string }[] = []
  const fuzzyMatches = documents.filter((d) => d.ai_result === "FUZZY_MATCH")
  if (fuzzyMatches.length > 0) {
    const avgConf =
      fuzzyMatches.reduce((sum, d) => sum + (d.ai_confidence || 0), 0) /
      fuzzyMatches.length
    aiInsights.push({
      type: "pattern",
      message: `${Math.round(avgConf * 100)}% average confidence on fuzzy matches — AI learning patterns`,
      severity: "info",
    })
  }
  if (highRiskAlerts > 0) {
    aiInsights.push({
      type: "risk",
      message: `${highRiskAlerts} high-risk transactions detected requiring immediate review`,
      severity: "high",
    })
  }

  // Currency chart data
  const currencyMap = new Map<string, number>()
  documents.forEach((d) => {
    const cur = d.original_currency || d.base_currency || "MYR"
    currencyMap.set(cur, (currencyMap.get(cur) || 0) + 1)
  })
  const currencyChartData: BarDatum[] = Array.from(currencyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([currency, count], i) => ({
      label: currency,
      count,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))

  // Reconciliation chart data
  const unmatchedDocs = documents.filter(
    (d) => d.ai_result === "UNMATCHED",
  ).length
  const reconciliationChartData: BarDatum[] = [
    { label: "Matched", count: matchedDocs, color: "#07cdae" },
    { label: "Fuzzy", count: fuzzyMatches.length, color: "#fda085" },
    { label: "Unmatched", count: unmatchedDocs, color: "#fe7096" },
    { label: "Approved", count: approvedCount, color: "#9a55ff" },
  ]

  const hasFxNormalization = documents.some(
    (d) =>
      d.original_currency &&
      d.base_currency &&
      d.original_currency !== d.base_currency,
  )

  return (
    <div className="min-h-screen bg-[#f5f4f8] dark:bg-[#13131f] p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        {/* ── Page Header ── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-lg bg-gradient-to-br from-[#da8cff] to-[#9a55ff] shadow-md">
            <TrendingUp className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
              Treasury Operations Center
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Welcome back,{" "}
              <span className="text-[#9a55ff] font-medium">
                {currentUser?.full_name || currentUser?.email}
              </span>
            </p>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <KPICard
            title="Total Reconciled"
            value={formatAmountCompact(totalAmount, baseCurrency)}
            subtitle={`${totalReconciled} documents`}
            icon={DollarSign}
            gradient="info"
            link="/history"
          />
          <KPICard
            title="Auto-Match Rate"
            value={`${autoMatchRate}%`}
            subtitle={`${matchedDocs} of ${documents.length} auto-matched`}
            icon={CheckCircle2}
            gradient="success"
          />
          <KPICard
            title="Pending Reviews"
            value={pendingReviews}
            subtitle="requires attention"
            icon={Clock}
            gradient="warning"
            link="/history"
          />
          <KPICard
            title="High Risk Alerts"
            value={highRiskAlerts}
            subtitle={`${exceptionCases} exception cases`}
            icon={AlertTriangle}
            gradient="danger"
            link="/history"
          />
        </div>

        {/* ── AI Attention Center ── */}
        {(needsAttention.length > 0 || aiInsights.length > 0) && (
          <div className="bg-white dark:bg-[#1e1e2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#da8cff] to-[#9a55ff]">
                <Zap className="size-4 text-white" />
              </div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                AI Attention Center
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {aiInsights.length > 0 && (
                <div className="space-y-2">
                  {aiInsights.map((insight, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                        insight.severity === "high"
                          ? "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800/40 dark:text-red-300"
                          : "bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800/40 dark:text-blue-300"
                      }`}
                    >
                      <AlertCircle className="size-4 mt-0.5 shrink-0" />
                      {insight.message}
                    </div>
                  ))}
                </div>
              )}

              {needsAttention.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-[#9a55ff] mb-3">
                    Requires Immediate Attention ({needsAttention.length})
                  </p>
                  <div className="space-y-2">
                    {needsAttention.map((doc) => (
                      <Link
                        key={doc.id}
                        to="/history"
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-[#9a55ff]/40 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {doc.original_filename}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {doc.ai_result === "UNMATCHED"
                                ? "Payer mismatch"
                                : doc.risk_level === "HIGH"
                                  ? "High risk detected"
                                  : "Requires review"}
                            </span>
                            {doc.risk_level && (
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  doc.risk_level === "HIGH"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                    : doc.risk_level === "MEDIUM"
                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                }`}
                              >
                                {doc.risk_level}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="size-4 text-[#9a55ff] shrink-0" />
                      </Link>
                    ))}
                  </div>
                  <Link
                    to="/history"
                    className="block text-center text-[#9a55ff] hover:text-purple-700 dark:hover:text-purple-300 text-sm font-medium mt-4"
                  >
                    View all pending reviews →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reconciliation Summary */}
          <SectionCard title="Reconciliation Summary">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-gray-400">Loading…</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <CheckCircle2 className="size-10 text-gray-300" />
                <p className="text-sm text-gray-400">No data yet</p>
              </div>
            ) : (
              <>
                <SvgBarChart data={reconciliationChartData} />
                <div className="flex flex-wrap gap-3 mt-3">
                  {reconciliationChartData.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>

          {/* Currency Distribution */}
          <SectionCard title="Currency Distribution">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-gray-400">Loading…</p>
              </div>
            ) : currencyChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2">
                <DollarSign className="size-10 text-gray-300" />
                <p className="text-sm text-gray-400">
                  No currency data available
                </p>
              </div>
            ) : (
              <>
                <SvgBarChart data={currencyChartData} />
                <div className="flex flex-wrap gap-3 mt-3">
                  {currencyChartData.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
                {hasFxNormalization && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800/40">
                    <p className="text-xs text-green-800 dark:text-green-300 font-semibold">
                      💱 FX Normalization Active
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      Multi-currency transactions automatically converted to
                      base currency.
                    </p>
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </div>

        {/* ── Recent Activity ── */}
        <SectionCard title="Recent Activity">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : recentActivity.length === 0 ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <FileText className="size-12 text-gray-300" />
              <p className="text-sm text-gray-400">No documents yet</p>
              <Link
                to="/reconcile"
                className="text-sm font-medium text-[#9a55ff] hover:text-purple-700"
              >
                Upload your first document →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    {["Document", "Date", "AI Result", "Status"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider pb-3 pr-4"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {recentActivity.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`p-1.5 rounded-md ${
                              doc.ai_result === "MATCHED"
                                ? "bg-green-100 dark:bg-green-950/40 text-green-600"
                                : doc.ai_result === "FUZZY_MATCH"
                                  ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-600"
                                  : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                            }`}
                          >
                            <FileText className="size-3.5" />
                          </div>
                          <span className="font-medium text-gray-800 dark:text-white truncate max-w-[180px]">
                            {doc.original_filename}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            doc.ai_result === "MATCHED"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : doc.ai_result === "FUZZY_MATCH"
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                                : doc.ai_result === "UNMATCHED"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {doc.ai_result?.replace(/_/g, " ") ?? "—"}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {doc.workflow_status
                          ? doc.workflow_status
                              .replace(/_/g, " ")
                              .toLowerCase()
                              .replace(/^\w/, (c) => c.toUpperCase())
                          : "Processing"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Quick Actions ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              to: "/reconcile",
              label: "Upload Documents",
              sub: "Start AI reconciliation workflow",
              icon: FileText,
              from: "#90caf9",
              to_: "#047edf",
              accent: "#047edf",
            },
            {
              to: "/history",
              label: "Review Queue",
              sub: `${pendingReviews} items need attention`,
              icon: Clock,
              from: "#da8cff",
              to_: "#9a55ff",
              accent: "#9a55ff",
            },
            {
              to: "/team",
              label: "Team Activity",
              sub: "Manage organisation members",
              icon: TrendingUp,
              from: "#84d9d2",
              to_: "#07cdae",
              accent: "#07cdae",
            },
          ].map(({ to, label, sub, icon: Icon, from, to_, accent }) => (
            <Link
              key={to}
              to={to}
              className="group p-6 bg-white dark:bg-[#1e1e2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-all"
              style={{ "--accent": accent } as React.CSSProperties}
            >
              <div
                className="mb-4 size-12 flex items-center justify-center rounded-xl shadow"
                style={{
                  background: `linear-gradient(135deg, ${from}, ${to_})`,
                }}
              >
                <Icon className="size-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-white mb-1">
                {label}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{sub}</p>
              <div
                className="mt-4 flex items-center gap-1 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: accent }}
              >
                Go <ArrowRight className="size-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
