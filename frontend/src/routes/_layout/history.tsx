import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { FilesService } from "../../client"
import { ReviewPanel, Timeline } from "../../components/Common/ReviewPanel"
import useCurrency from "../../hooks/useCurrency"
import { useUserRole } from "../../hooks/useUserRole"

export const Route = createFileRoute("/_layout/history")({
  component: HistoryPage,
})

function AIResultBadge({ result }: { result: string | null }) {
  if (!result)
    return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>

  const styles: Record<string, string> = {
    MATCHED:
      "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700",
    FUZZY_MATCH:
      "bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700",
    UNMATCHED:
      "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700",
  }
  const labels: Record<string, string> = {
    MATCHED: "✓ Match",
    FUZZY_MATCH: "~ Fuzzy",
    UNMATCHED: "✗ No Match",
  }
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap inline-block ${styles[result] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
    >
      {labels[result] ?? result}
    </span>
  )
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING_EXTRACTION:
      "bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    EXTRACTED:
      "bg-blue-100 text-blue-700 border border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700",
    PENDING_ACTION:
      "bg-purple-100 text-purple-700 border border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700",
    APPROVED:
      "bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700",
    UNDER_REVIEW:
      "bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-700",
    EXCEPTION_APPROVED:
      "bg-cyan-100 text-cyan-700 border border-cyan-300 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-700",
    REJECTED:
      "bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-700",
  }
  const labels: Record<string, string> = {
    PENDING_EXTRACTION: "Pending",
    EXTRACTED: "Extracted",
    PENDING_ACTION: "Needs Review",
    APPROVED: "✓ Approved",
    UNDER_REVIEW: "⚠ Under Review",
    EXCEPTION_APPROVED: "Exception OK",
    REJECTED: "✗ Rejected",
  }
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null

  const styles: Record<string, string> = {
    LOW: "bg-green-100 text-green-700 border border-green-300 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800/60",
    MEDIUM:
      "bg-yellow-100 text-yellow-700 border border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800/60",
    HIGH: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800/60",
  }

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-bold ${styles[level] ?? ""}`}
    >
      {level}
    </span>
  )
}

interface DocumentRowProps {
  doc: any
  isSelected: boolean
  onSelectToggle: () => void
  onTriggerModalPreview: (url: string) => void
}

function DocumentRow({
  doc,
  isSelected,
  onSelectToggle,
  onTriggerModalPreview,
}: DocumentRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const queryClient = useQueryClient()
  const { baseCurrency, formatAmount } = useCurrency()

  const handleRowClick = async () => {
    const nextExpanded = !expanded
    setExpanded(nextExpanded)

    if (nextExpanded && !previewUrl && doc.file_type !== "excel") {
      setLoadingPreview(true)
      try {
        const res = (await FilesService.getDownloadUrl({
          documentId: doc.id,
        })) as { url: string }
        setPreviewUrl(res.url)
      } catch {
        /* fail gracefully */
      } finally {
        setLoadingPreview(false)
      }
    }
  }

  const recon = doc.reconciliation_result
  const decision = recon?.agent_decision
  const fxResult = recon?.fx_result
  const proof = recon?.proof
  const { canDeleteReports, canEditReports } = useUserRole()

  const riskColorMap: Record<string, string> = {
    HIGH: "bg-red-50 border-l-2 border-l-red-500 dark:bg-red-950/20",
    MEDIUM:
      "bg-yellow-50/50 border-l-2 border-l-yellow-500 dark:bg-yellow-950/10",
    LOW: "bg-green-50/50 border-l-2 border-l-green-500 dark:bg-green-950/10",
  }
  const computedRowStyle = riskColorMap[doc.risk_level] ?? ""

  return (
    <>
      <tr
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('input[type="checkbox"]'))
            return
          handleRowClick()
        }}
        className={`border-t border-gray-200 dark:border-gray-800 transition-colors duration-150 cursor-pointer select-none
          ${computedRowStyle}
          ${expanded ? "bg-gray-100 dark:bg-gray-800/60" : "hover:bg-gray-50 dark:hover:bg-gray-50/5"}`}
      >
        {canDeleteReports && (
          <td className="px-4 py-3 text-center">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onSelectToggle}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-gray-900 h-4 w-4"
            />
          </td>
        )}

        <td className="px-4 py-3 font-medium text-sm flex items-center gap-2 text-gray-800 dark:text-gray-200">
          <span
            className={`text-gray-400 dark:text-gray-500 transition-transform duration-200 text-xs ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          {doc.original_filename}
        </td>
        <td className="px-4 py-3 text-sm">
          <AIResultBadge result={doc.ai_result} />
        </td>
        <td className="px-4 py-3 text-sm">
          <WorkflowStatusBadge status={doc.workflow_status} />
        </td>
        <td className="px-4 py-3 text-sm">
          <RiskBadge level={doc.risk_level} />
        </td>
        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">
          {new Date(doc.uploaded_at).toLocaleString()}
        </td>
      </tr>

      {/* Accordion expand panel */}
      <tr
        className={`border-x border-gray-200 dark:border-gray-800 transition-all duration-300 ease-in-out ${expanded ? "border-t border-gray-200 dark:border-gray-800" : ""}`}
      >
        <td colSpan={canDeleteReports ? 6 : 5} className="p-0 overflow-hidden">
          <div
            style={{
              maxHeight: expanded ? "2000px" : "0px",
              opacity: expanded ? 1 : 0,
              transition:
                "max-height 320ms cubic-bezier(0.4,0,0.2,1), opacity 220ms ease",
              overflow: "hidden",
            }}
          >
            <div
              className="px-6 py-5 bg-gray-50 dark:bg-gray-950/95"
              style={{ maxHeight: "70vh", overflowY: "auto" }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
                {/* === LEFT COLUMN: preview + extracted === */}
                <div className="flex flex-col gap-2 min-w-0 lg:w-64">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                    Document Preview
                  </p>
                  {loadingPreview && (
                    <div className="w-full h-40 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse flex items-center justify-center">
                      <span className="text-gray-500 text-xs">
                        Loading Asset...
                      </span>
                    </div>
                  )}
                  {previewUrl && doc.file_type === "pdf" && (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-6 flex flex-col items-center gap-2 border border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full">
                        {doc.original_filename}
                      </span>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 text-xs hover:underline"
                      >
                        Open PDF ↗
                      </a>
                    </div>
                  )}
                  {previewUrl && doc.file_type === "image" && (
                    <button
                      type="button"
                      onClick={() => onTriggerModalPreview(previewUrl)}
                      className="group relative flex items-center justify-center w-full text-left focus:outline-none rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors cursor-zoom-in"
                    >
                      <img
                        src={previewUrl}
                        alt={doc.original_filename}
                        className="rounded-lg max-w-full object-contain max-h-64 transition-transform duration-200 group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="bg-black/70 text-white text-[10px] font-medium px-2 py-1 rounded">
                          Expand Size
                        </span>
                      </div>
                    </button>
                  )}
                  {doc.file_type === "excel" && (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-6 flex flex-col items-center gap-2 border border-gray-200 dark:border-gray-700">
                      <span className="text-4xl">📊</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {doc.original_filename}
                      </span>
                    </div>
                  )}

                  {/* Multi-Currency Display */}
                  {(doc.original_amount || doc.extracted_data) &&
                    !doc.extracted_data?.rows && (
                      <div className="flex flex-col gap-2 mt-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                          Payment Details
                        </p>

                        {doc.original_amount && doc.original_currency && (
                          <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50 rounded-lg px-3 py-2">
                            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                              Original Amount
                            </p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">
                              {doc.original_currency}{" "}
                              {doc.original_amount.toFixed(2)}
                            </p>
                            {doc.transaction_date && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Date: {doc.transaction_date}
                              </p>
                            )}
                          </div>
                        )}

                        {doc.base_amount &&
                          doc.original_currency !== doc.base_currency && (
                            <div className="bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800/50 rounded-lg px-3 py-2">
                              <p className="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-2">
                                <span>Base Currency (Reconciliation)</span>
                                {doc.fx_rate_used && (
                                  <span
                                    className="text-gray-400 dark:text-gray-500"
                                    title={`Historical FX rate used on ${doc.fx_rate_date || "transaction date"}`}
                                  >
                                    @ {doc.fx_rate_used.toFixed(4)}
                                  </span>
                                )}
                              </p>
                              <p className="text-lg font-bold text-green-700 dark:text-green-300">
                                {formatAmount(
                                  doc.base_amount,
                                  doc.base_currency || baseCurrency,
                                )}
                              </p>
                              {doc.fx_rate_date && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  FX Rate Date: {doc.fx_rate_date}
                                </p>
                              )}
                            </div>
                          )}

                        {doc.extracted_data && (
                          <div className="flex flex-col gap-1">
                            {doc.extracted_data.payer && (
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Payer:</span>
                                <span className="text-gray-700 dark:text-gray-300">
                                  {doc.extracted_data.payer}
                                </span>
                              </div>
                            )}
                            {doc.extracted_data.payee && (
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Payee:</span>
                                <span className="text-gray-700 dark:text-gray-300">
                                  {doc.extracted_data.payee}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* === RIGHT COLUMN: timeline + recon === */}
                <div className="flex-1 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                      Processing Timeline
                    </p>
                    <Timeline
                      status={doc.workflow_status}
                      caseId={doc.case_id}
                    />
                  </div>
                  {!recon ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm italic">
                      No reconciliation has been executed for this profile yet.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <AIResultBadge result={doc.ai_result} />
                          <WorkflowStatusBadge status={doc.workflow_status} />
                          {doc.risk_level && (
                            <RiskBadge level={doc.risk_level} />
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            Confidence:{" "}
                            {Math.round((doc.ai_confidence ?? 0) * 100)}%
                          </span>
                        </div>
                        {proof && (
                          <div className="flex items-center gap-2 text-sm bg-gray-100 dark:bg-gray-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-800">
                            <span className="text-gray-900 dark:text-white font-semibold font-mono">
                              {proof.currency} {proof.amount}
                            </span>
                            {fxResult && proof.currency !== baseCurrency && (
                              <>
                                <span className="text-gray-400 dark:text-gray-600">
                                  →
                                </span>
                                <span className="text-green-600 dark:text-green-400 font-semibold font-mono">
                                  {baseCurrency} {fxResult.to_amount}
                                </span>
                                <span className="text-gray-500 text-xs font-mono">
                                  @ {fxResult.rate}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              decision?.final_status === "matched"
                                ? "bg-green-500"
                                : decision?.final_status === "fuzzy"
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                            style={{
                              width: `${(decision?.confidence ?? 0) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      {doc.ai_explanation && (
                        <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40 rounded-lg px-4 py-3 flex flex-col gap-1">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">
                            AI Analysis (Original)
                          </p>
                          <p className="text-xs text-gray-700 dark:text-gray-300 italic leading-relaxed">
                            "{doc.ai_explanation}"
                          </p>
                        </div>
                      )}
                      {recon.match_scores?.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">
                            Match Scores
                          </p>
                          {recon.match_scores.map((s: any, i: number) => (
                            <div
                              key={i}
                              className={`grid grid-cols-3 gap-1 text-xs px-3 py-1.5 rounded-lg ${
                                decision?.matched_entry_index === i
                                  ? "bg-green-50 border border-green-300 dark:bg-green-950/60 dark:border-green-800"
                                  : "bg-gray-100/60 border border-transparent dark:bg-gray-900/60"
                              }`}
                            >
                              <span className="text-gray-600 dark:text-gray-400 font-medium">
                                Entry {i + 1}
                              </span>
                              <span
                                className={
                                  s.amount_match
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }
                              >
                                Amt {s.amount_match ? "✓" : "✗"} (
                                {s.amount_diff_pct}%)
                              </span>
                              <span
                                className={
                                  s.date_match
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                }
                              >
                                Date {s.date_match ? "✓" : "✗"} ({s.days_apart}
                                d)
                              </span>
                            </div>
                          ))}
                          {decision && (
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                              <ReviewPanel
                                documentId={doc.id}
                                finalStatus={decision.final_status}
                                matchScores={recon.match_scores}
                                confidence={decision.confidence}
                                currentReviewStatus={doc.review_status}
                                currentCaseId={doc.case_id}
                                currentRiskScore={doc.risk_score}
                                isReadOnly={!canEditReports}
                                onSaved={() =>
                                  queryClient.invalidateQueries({
                                    queryKey: ["my-documents"],
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}

function HistoryPage() {
  const { canDeleteReports } = useUserRole()
  const [filter, setFilter] = useState<string>("all")
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [activeModalUrl, setActiveModalUrl] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  useEffect(() => {
    if (!activeModalUrl) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveModalUrl(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeModalUrl])

  const deleteMultipleMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => FilesService.deleteFile({ documentId: id })),
      )
    },
    onSuccess: () => {
      setSelectedDocIds([])
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
    },
  })

  const docDataList = data?.data || []

  const filters = [
    { key: "all", label: "All orders", count: docDataList.length },
    {
      key: "needs_review",
      label: "Needs Review",
      count: docDataList.filter(
        (d: any) => d.workflow_status === "PENDING_ACTION",
      ).length,
    },
    {
      key: "high_risk",
      label: "High Risk",
      count: docDataList.filter((d: any) => d.risk_level === "HIGH").length,
    },
    {
      key: "exceptions",
      label: "Exceptions",
      count: docDataList.filter(
        (d: any) => d.workflow_status === "EXCEPTION_APPROVED",
      ).length,
    },
    {
      key: "approved",
      label: "Approved",
      count: docDataList.filter((d: any) => d.workflow_status === "APPROVED")
        .length,
    },
    {
      key: "under_review",
      label: "Under Review",
      count: docDataList.filter(
        (d: any) => d.workflow_status === "UNDER_REVIEW",
      ).length,
    },
  ]

  const filteredDocs = docDataList.filter((doc: any) => {
    if (filter === "all") return true
    if (filter === "needs_review")
      return doc.workflow_status === "PENDING_ACTION"
    if (filter === "high_risk") return doc.risk_level === "HIGH"
    if (filter === "exceptions")
      return doc.workflow_status === "EXCEPTION_APPROVED"
    if (filter === "approved") return doc.workflow_status === "APPROVED"
    if (filter === "under_review") return doc.workflow_status === "UNDER_REVIEW"
    return true
  })

  const toggleSelectAll = () => {
    if (selectedDocIds.length === filteredDocs.length) {
      setSelectedDocIds([])
    } else {
      setSelectedDocIds(filteredDocs.map((d: any) => d.id))
    }
  }

  const toggleSelectRow = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const handleDeleteTriggered = () => {
    if (selectedDocIds.length === 0) return
    const confirmationMessage = `Are you sure you want to permanently delete the ${selectedDocIds.length} selected document(s)?`
    if (window.confirm(confirmationMessage)) {
      deleteMultipleMutation.mutate(selectedDocIds)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Treasury Operations Dashboard
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Autonomous cross-border payment reconciliation, discrepancy
          investigation, and exception management.
        </p>
      </div>

      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-gray-200 dark:border-zinc-800 gap-4 pt-4">
        <div className="flex flex-wrap -mb-px gap-1 z-10">
          {filters.map((f) => {
            const isActive = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`relative px-5 py-3 text-sm font-medium rounded-t-xl transition-all duration-200 flex items-center gap-2.5 border border-b-0
                  ${
                    isActive
                      ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 border-gray-200 dark:border-zinc-700 shadow-md font-semibold z-20 -translate-y-0.5"
                      : "bg-gray-100/50 dark:bg-zinc-900/40 text-gray-500 border-transparent hover:bg-gray-100 dark:hover:bg-zinc-800/70 hover:text-gray-700 dark:hover:text-zinc-300 hover:-translate-y-px"
                  }`}
              >
                <span>{f.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-zinc-800 text-gray-500"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        {canDeleteReports && (
          <div className="pb-2.5">
            <button
              type="button"
              disabled={
                selectedDocIds.length === 0 || deleteMultipleMutation.isPending
              }
              onClick={handleDeleteTriggered}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-all border ${
                selectedDocIds.length > 0
                  ? "bg-red-600 text-white border-red-500 hover:bg-red-700 active:scale-[0.98]"
                  : "bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-800/40 dark:text-gray-500 dark:border-gray-800"
              }`}
            >
              {deleteMultipleMutation.isPending
                ? "Deleting..."
                : selectedDocIds.length > 0
                  ? `Delete Selected (${selectedDocIds.length})`
                  : "Delete Selected"}
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Loading asset pipelines...
        </p>
      ) : !docDataList.length ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-12">
          No uploads yet. Go to Reconcile to upload a payment proof.
        </p>
      ) : !filteredDocs?.length ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-12">
          No documents match the selected filter tab parameters.
        </p>
      ) : (
        <div className="w-full overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900/20 backdrop-blur-sm shadow-xl">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
              <tr>
                {canDeleteReports && (
                  <th className="px-4 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      checked={
                        selectedDocIds.length === filteredDocs.length &&
                        filteredDocs.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-gray-900 h-4 w-4"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                  Filename
                </th>
                <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                  AI Result
                </th>
                <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                  Workflow Status
                </th>
                <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                  Uploaded
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800/60">
              {filteredDocs.map((doc: any) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedDocIds.includes(doc.id)}
                  onSelectToggle={() => toggleSelectRow(doc.id)}
                  onTriggerModalPreview={(url) => setActiveModalUrl(url)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* FULL-SCREEN IMMERSIVE PREVIEW MODAL OVERLAY */}
      {activeModalUrl && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/95 select-none backdrop-blur-md animate-fade-in">
          <button
            type="button"
            onClick={() => setActiveModalUrl(null)}
            className="absolute top-4 right-4 z-110 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white px-4 py-2 text-sm font-medium rounded-md shadow-lg transition-colors border border-zinc-700/60"
          >
            Close
          </button>

          <button
            type="button"
            onClick={() => setActiveModalUrl(null)}
            className="absolute top-0 left-0 bottom-0 w-1/5 z-101 cursor-zoom-out bg-transparent border-0 p-0"
            aria-label="Close preview"
          />
          <div className="relative z-105 max-w-full max-h-screen p-4 flex items-center justify-center">
            <img
              src={activeModalUrl}
              alt="Focused view asset preview"
              className="max-w-full max-h-[94vh] object-contain rounded border border-zinc-800 shadow-2xl"
            />
          </div>
          <button
            type="button"
            onClick={() => setActiveModalUrl(null)}
            className="absolute top-0 right-0 bottom-0 w-1/5 z-101 cursor-zoom-out bg-transparent border-0 p-0"
            aria-label="Close preview"
          />
        </div>
      )}
    </div>
  )
}
