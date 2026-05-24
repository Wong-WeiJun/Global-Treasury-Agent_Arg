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
import { useState, useEffect } from "react"
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
      className={`${colorClass} rounded-xl p-6 border backdrop-blur-md transition-all duration-200 ${link ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide mb-1">
            {title}
          </p>
          <h4 className="text-2xl font-bold font-mono tracking-tight">{value}</h4>
        </div>
        <div className="p-2.5 rounded-lg bg-white/10 backdrop-blur-sm">
          <Icon className="size-5 text-white" />
        </div>
      </div>
      {subtitle && (
        <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10 opacity-90">
          <span>{subtitle}</span>
          {trend && <span className="font-medium font-mono">{trend}</span>}
        </div>
      )}
    </div>
  )

  if (link) {
    return <Link to={link}>{card}</Link>
  }
  return card
}

function Dashboard() {
  const { user } = useAuth()
  const { formatAmount } = useCurrency()
  
  // Animation Stage States: 0 = User Greeting, 1 = Brand Reveal, 2 = Widgets Rendered
  const [animationStage, setAnimationStage] = useState<number>(0)

  const { data } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  useEffect(() => {
    if (animationStage === 0) {
      const timer1 = setTimeout(() => setAnimationStage(1), 3000)
      return () => clearTimeout(timer1)
    }
    if (animationStage === 1) {
      const timer2 = setTimeout(() => setAnimationStage(2), 3000)
      return () => clearTimeout(timer2)
    }
  }, [animationStage])

  const skipAnimations = () => {
    setAnimationStage(2)
  }

  const docDataList = data?.data || []
  const pendingReviews = docDataList.filter((d: any) => d.workflow_status === "PENDING_ACTION").length
  const highRiskCount = docDataList.filter((d: any) => d.risk_level === "HIGH").length
  const totalProcessed = docDataList.length

  const verifiedMatches = docDataList.filter((d: any) => d.workflow_status === "APPROVED" || d.workflow_status === "EXCEPTION_APPROVED")
  const totalVolume = verifiedMatches.reduce((acc: number, d: any) => {
    const amt = parseFloat(d.extracted_data?.myr_amount || d.extracted_data?.amount || "0")
    return acc + (isNaN(amt) ? 0 : amt)
  }, 0)

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full text-white overflow-hidden p-6">
      {/* Global Embedded Keyframe Animations Injection */}
      <style>{`
        @keyframes customZoomIn {
          0% {
            opacity: 0;
            transform: scale3d(0.3, 0.3, 0.3);
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: scale3d(1, 1, 1);
          }
        }
        @keyframes customFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-zoom-fade {
          animation: customZoomIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards,
                     customFadeOut 0.6s cubic-bezier(0.16, 1, 0.3, 1) 2.4s forwards;
        }
        .animate-widget-zoom {
          animation: customZoomIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Deep Immersive GIF Background Layer with Darkness Filter Mask */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center" 
        style={{ backgroundImage: "url('/assets/Dashboard/nightdashboard.gif')" }}
      />
      <div className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm" />

      {/* Interactive Animation Se quence Wrapper */}
      {animationStage < 2 ? (
        <div 
          onClick={skipAnimations}
          className="fixed inset-0 w-screen h-screen z-[999] flex flex-col items-center justify-center cursor-pointer select-none px-4 bg-transparent"
          title="Click anywhere to skip introductory layout metrics"
        >
          {animationStage === 0 && (
            <div className="text-center animate-zoom-fade max-w-4xl px-6">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400 drop-shadow-2xl whitespace-normal">
                Welcome back, {user?.full_name || user?.email || "Operator"}
              </h1>
            </div>
          )}

          {animationStage === 1 && (
            <div className="text-center animate-zoom-fade flex flex-col gap-4 max-w-4xl px-6">
              <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter text-blue-400 drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]">
                MyAudit
              </h1>
              <h2 className="text-xl md:text-3xl text-gray-300 font-medium tracking-wide opacity-90">
                Your Treasury Operations Center
              </h2>
            </div>
          )}
          
          <div className="absolute bottom-12 text-xs font-mono text-gray-500 tracking-widest uppercase animate-pulse bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
            Click anywhere to skip sequence ↗
          </div>
        </div>
      ) : (
        /* Final Real-time Operational Widgets Frame Grid Layout */
        <div className="relative z-10 max-w-7xl mx-auto flex flex-col gap-8 animate-widget-zoom">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Operational Overview</h1>
              <p className="text-sm text-gray-400 mt-1">
                Real-time tracking of automated cross-border matching mechanics and active risks.
              </p>
            </div>
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 backdrop-blur-sm text-xs font-mono text-gray-300">
              <Zap className="size-4 text-amber-400 animate-pulse" />
              <span>Pipeline Engine status: Active</span>
            </div>
          </div>

          {/* Primary Top Metric Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <KPICard
              title="Total Audited Volume"
              value={formatAmount(totalVolume)}
              subtitle="Settled & approved payments"
              icon={DollarSign}
              colorClass="bg-gradient-to-br from-blue-950/40 to-blue-900/20 border-blue-800/40 text-blue-200"
            />
            <KPICard
              title="Needs Review"
              value={pendingReviews}
              subtitle="Pending analyst verification"
              icon={Clock}
              colorClass="bg-gradient-to-br from-amber-950/40 to-amber-900/20 border-amber-800/40 text-amber-200"
              link="/history"
            />
            <KPICard
              title="High Risk Anomalies"
              value={highRiskCount}
              subtitle="Critical variance thresholds"
              icon={AlertTriangle}
              colorClass="bg-gradient-to-br from-red-950/40 to-red-900/20 border-red-800/40 text-red-200"
              link="/history"
            />
            <KPICard
              title="Total Pipelines Run"
              value={totalProcessed}
              subtitle="Historical payload runs"
              icon={TrendingUp}
              colorClass="bg-gradient-to-br from-zinc-900/60 to-zinc-800/30 border-zinc-700/40 text-zinc-300"
            />
          </div>

          {/* Secondary Quick Jump Gateway Navigation Anchors Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Link
              to="/reconcile"
              className="group p-6 bg-gradient-to-br from-blue-950/40 to-blue-900/20 border border-blue-800/40 hover:border-blue-700 rounded-xl transition-all shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                  <FileText className="size-6 text-blue-400" />
                </div>
                <ArrowRight className="size-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                Upload Documents
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Execute cross-border batch document extraction workflows against core payment tracking structures.
              </p>
            </Link>

            <Link
              to="/history"
              className="group p-6 bg-gradient-to-br from-purple-950/40 to-purple-900/20 border border-purple-800/40 hover:border-purple-700 rounded-xl transition-all shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-500/10 rounded-xl group-hover:scale-110 transition-transform">
                  <Clock className="size-6 text-purple-400" />
                </div>
                <ArrowRight className="size-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Review Queue</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Investigate automated discrepancies, clear fuzzy exceptions, and audit historical metadata records.
              </p>
            </Link>

            <Link
              to="/team"
              className="group p-6 bg-gradient-to-br from-green-950/40 to-green-900/20 border border-green-800/40 hover:border-green-700 rounded-xl transition-all shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-500/10 rounded-xl group-hover:scale-110 transition-transform">
                  <CheckCircle2 className="size-6 text-green-400" />
                </div>
                <ArrowRight className="size-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Team Controls</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Provision organizational clearance hierarchies, track operator oversight loops, and control scopes.
              </p>
            </Link>
          </div>

          {/* Quick Informational Risk Warning Callout Banner */}
          {highRiskCount > 0 && (
            <div className="bg-red-950/30 border border-red-900/40 rounded-xl p-4 flex gap-3 items-start backdrop-blur-sm">
              <AlertCircle className="size-5 text-red-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="text-xs text-red-200/90 leading-relaxed">
                <strong>Attention Required:</strong> There are currently {highRiskCount} un-cleared items flagged as critical variance high risk. Please ensure cross-border clearing compliance protocols are monitored within active audit cycles.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}