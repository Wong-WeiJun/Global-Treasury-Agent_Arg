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
    meta: [
      {
        title: "MyAudit - Dashboard",
      },
    ],
  }),
})

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: string
  icon: any
  colorClass: string
  link?: string
}

function KPICard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  colorClass,
  link,
}: KPICardProps) {
  const card = (
    <div
      className={`${colorClass} rounded-xl p-6 border transition-all duration-200 ${link ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-1">
            {title}
          </p>
          <p className="text-3xl font-bold">{value}</p>
          {subtitle && <p className="text-xs opacity-70 mt-1">{subtitle}</p>}
        </div>
        <div className="p-3 rounded-lg bg-black/10">
          <Icon className="size-6" />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-xs font-medium opacity-80">
          <TrendingUp className="size-3" />
          <span>{trend}</span>
        </div>
      )}
    </div>
  )

  return link ? <Link to={link}>{card}</Link> : card
}

function Dashboard() {
  const { user: currentUser } = useAuth()
  const { baseCurrency, formatAmountCompact } = useCurrency()

  // Fetch documents for dashboard stats
  const { data: docs, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  const documents = docs?.data || []

  // Calculate KPIs
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

  // Calculate auto-match rate
  const matchedDocs = documents.filter((d) => d.ai_result === "MATCHED").length
  const autoMatchRate =
    documents.length > 0
      ? Math.round((matchedDocs / documents.length) * 100)
      : 0

  // Calculate total reconciled amount
  const totalAmount = documents.reduce(
    (sum, d) => sum + (d.base_amount || d.original_amount || 0),
    0,
  )

  // Get needs attention items (high priority)
  const needsAttention = documents
    .filter(
      (d) =>
        d.workflow_status === "PENDING_ACTION" ||
        d.risk_level === "HIGH" ||
        d.ai_result === "UNMATCHED",
    )
    .slice(0, 5)

  // Recent activity
  const recentActivity = documents
    .sort(
      (a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
    )
    .slice(0, 5)

  // AI Insights (pattern detection)
  const aiInsights = []
  const fuzzyMatches = documents.filter((d) => d.ai_result === "FUZZY_MATCH")
  if (fuzzyMatches.length > 0) {
    const avgConfidence =
      fuzzyMatches.reduce((sum, d) => sum + (d.ai_confidence || 0), 0) /
      fuzzyMatches.length
    aiInsights.push({
      type: "pattern",
      message: `${Math.round(avgConfidence * 100)}% average confidence on fuzzy matches - AI learning patterns`,
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

  // Currency distribution
  const currencyMap = new Map<string, number>()
  documents.forEach((d) => {
    const currency = d.original_currency || d.base_currency || "MYR"
    currencyMap.set(currency, (currencyMap.get(currency) || 0) + 1)
  })

  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Treasury Operations Center
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Welcome back, {currentUser?.full_name || currentUser?.email}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Reconciled"
          value={formatAmountCompact(totalAmount, baseCurrency)}
          subtitle={`${totalReconciled} documents`}
          icon={DollarSign}
          colorClass="bg-blue-950/40 text-blue-100 border-blue-800/60"
          link="/history"
        />
        <KPICard
          title="Auto-Match Rate"
          value={`${autoMatchRate}%`}
          subtitle={`${matchedDocs} of ${documents.length} auto-matched`}
          trend="+12% this week"
          icon={CheckCircle2}
          colorClass="bg-green-950/40 text-green-100 border-green-800/60"
        />
        <KPICard
          title="Pending Reviews"
          value={pendingReviews}
          subtitle="requires attention"
          icon={Clock}
          colorClass="bg-yellow-950/40 text-yellow-100 border-yellow-800/60"
          link="/history"
        />
        <KPICard
          title="High Risk Alerts"
          value={highRiskAlerts}
          subtitle={`${exceptionCases} exception cases`}
          icon={AlertTriangle}
          colorClass="bg-red-950/40 text-red-100 border-red-800/60"
          link="/history"
        />
      </div>

      {/* AI Attention Center */}
      {(needsAttention.length > 0 || aiInsights.length > 0) && (
        <section className="bg-gradient-to-br from-purple-950/40 to-blue-950/40 border border-purple-800/60 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-600/20">
              <Zap className="size-5 text-purple-300" />
            </div>
            <h2 className="text-xl font-bold text-white">
              ⚡ AI Attention Center
            </h2>
          </div>

          {/* AI Insights */}
          {aiInsights.length > 0 && (
            <div className="mb-4 space-y-2">
              {aiInsights.map((insight, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    insight.severity === "high"
                      ? "bg-red-950/40 border border-red-800/60"
                      : "bg-blue-950/40 border border-blue-800/60"
                  }`}
                >
                  <AlertCircle
                    className={`size-5 mt-0.5 ${insight.severity === "high" ? "text-red-400" : "text-blue-400"}`}
                  />
                  <p className="text-sm text-gray-200">{insight.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Needs Attention Queue */}
          {needsAttention.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-purple-300 uppercase font-semibold tracking-wide mb-3">
                Requires Immediate Attention ({needsAttention.length})
              </p>
              {needsAttention.map((doc) => (
                <Link
                  key={doc.id}
                  to="/history"
                  className="block p-4 bg-black/20 hover:bg-black/30 rounded-lg border border-purple-700/40 hover:border-purple-600/60 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {doc.original_filename}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400">
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
                                ? "bg-red-900/50 text-red-300"
                                : doc.risk_level === "MEDIUM"
                                  ? "bg-yellow-900/50 text-yellow-300"
                                  : "bg-green-900/50 text-green-300"
                            }`}
                          >
                            {doc.risk_level}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-purple-400" />
                  </div>
                </Link>
              ))}
              <Link
                to="/history"
                className="block text-center text-purple-400 hover:text-purple-300 text-sm font-medium mt-3"
              >
                View all pending reviews →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h2>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : recentActivity.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="size-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No documents yet</p>
              <Link
                to="/reconcile"
                className="inline-block mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Upload your first document →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors"
                >
                  <div
                    className={`p-2 rounded-lg ${
                      doc.ai_result === "MATCHED"
                        ? "bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400"
                        : doc.ai_result === "FUZZY_MATCH"
                          ? "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-400"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <FileText className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {doc.original_filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(doc.uploaded_at).toLocaleDateString()} •{" "}
                      {doc.workflow_status
                        ? doc.workflow_status
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/^\w/, (c) => c.toUpperCase())
                        : "Processing"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Currency Analytics */}
        <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Currency Distribution
          </h2>
          {currencyMap.size === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="size-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                No currency data available
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(currencyMap.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([currency, count]) => {
                  const percentage = Math.round(
                    (count / documents.length) * 100,
                  )
                  return (
                    <div key={currency}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {currency}
                        </span>
                        <span className="text-xs text-gray-500">
                          {count} docs ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              {documents.some(
                (d) =>
                  d.original_currency &&
                  d.base_currency &&
                  d.original_currency !== d.base_currency,
              ) && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800/40">
                  <p className="text-xs text-green-800 dark:text-green-300 font-medium">
                    💱 FX Normalization Active
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Multi-currency transactions automatically converted to base
                    currency for reconciliation
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Reconciliation Trends */}
      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Reconciliation Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800/40">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Matched
              </p>
              <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-2xl font-bold text-green-900 dark:text-green-200">
              {matchedDocs}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Auto-approved by AI
            </p>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800/40">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Fuzzy Match
              </p>
              <AlertCircle className="size-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">
              {fuzzyMatches.length}
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
              Pending human review
            </p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-300">
                Approved
              </p>
              <CheckCircle2 className="size-5 text-gray-600 dark:text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-200">
              {approvedCount}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Completed workflows
            </p>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/reconcile"
          className="p-6 bg-gradient-to-br from-blue-950/40 to-blue-900/40 hover:from-blue-950/60 hover:to-blue-900/60 border border-blue-800/60 rounded-xl transition-all"
        >
          <FileText className="size-8 text-blue-300 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">
            Upload Documents
          </h3>
          <p className="text-sm text-blue-200">
            Start AI reconciliation workflow
          </p>
        </Link>

        <Link
          to="/history"
          className="p-6 bg-gradient-to-br from-purple-950/40 to-purple-900/40 hover:from-purple-950/60 hover:to-purple-900/60 border border-purple-800/60 rounded-xl transition-all"
        >
          <Clock className="size-8 text-purple-300 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">Review Queue</h3>
          <p className="text-sm text-purple-200">
            {pendingReviews} items need attention
          </p>
        </Link>

        <Link
          to="/team"
          className="p-6 bg-gradient-to-br from-green-950/40 to-green-900/40 hover:from-green-950/60 hover:to-green-900/60 border border-green-800/60 rounded-xl transition-all"
        >
          <TrendingUp className="size-8 text-green-300 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">Team Activity</h3>
          <p className="text-sm text-green-200">Manage organization members</p>
        </Link>
      </section>
    </div>
  )
}

export default Dashboard
