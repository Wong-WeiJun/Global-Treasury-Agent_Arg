import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FilesService } from "../../client"
import { ReviewPanel, Timeline } from "../../components/Common/ReviewPanel"

export const Route = createFileRoute("/_layout/history")({
  component: HistoryPage,
})

function AIResultBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-gray-500 text-xs">—</span>

  const styles: Record<string, string> = {
    MATCHED: "bg-green-900/50 text-green-300 border border-green-700",
    FUZZY_MATCH: "bg-amber-900/50 text-amber-300 border border-amber-700",
    UNMATCHED: "bg-red-900/50 text-red-300 border border-red-700",
  }
  const labels: Record<string, string> = {
    MATCHED: "✓ Match",
    FUZZY_MATCH: "~ Fuzzy",
    UNMATCHED: "✗ No Match",
  }
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[result] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[result] ?? result}
    </span>
  )
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING_EXTRACTION: "bg-gray-800 text-gray-400 border border-gray-700",
    EXTRACTED: "bg-blue-900/50 text-blue-300 border border-blue-700",
    PENDING_ACTION: "bg-purple-900/50 text-purple-300 border border-purple-700",
    APPROVED: "bg-green-900/50 text-green-300 border border-green-700",
    UNDER_REVIEW: "bg-orange-900/50 text-orange-300 border border-orange-700",
    EXCEPTION_APPROVED: "bg-cyan-900/50 text-cyan-300 border border-cyan-700",
    REJECTED: "bg-rose-900/50 text-rose-300 border border-rose-700",
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
      className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${styles[status] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return null

  const styles: Record<string, string> = {
    LOW: "bg-green-900/30 text-green-400 border border-green-800",
    MEDIUM: "bg-yellow-900/30 text-yellow-400 border border-yellow-800",
    HIGH: "bg-red-900/30 text-red-400 border border-red-800",
  }

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-bold ${styles[level] ?? ""}`}
    >
      {level}
    </span>
  )
}

function DocumentRow({ doc }: { doc: any }) {
  const [expanded, setExpanded] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => FilesService.deleteFile({ documentId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["my-documents"] }),
  })

  const handleDownloadSingle = () => {
    downloadDocumentsCSV([doc], `${doc.original_filename}_result.csv`)
  }

  const handleToggle = async () => {
    if (!expanded && !previewUrl && doc.file_type !== "excel") {
      setLoadingPreview(true)
      try {
        const res = (await FilesService.getDownloadUrl({
          documentId: doc.id,
        })) as { url: string }
        setPreviewUrl(res.url)
      } catch {
        // preview unavailable
      } finally {
        setLoadingPreview(false)
      }
    }
    setExpanded((p) => !p)
  }

  const recon = doc.reconciliation_result
  const decision = recon?.agent_decision
  const fxResult = recon?.fx_result
  const proof = recon?.proof

  return (
    <>
      <tr className="border-t hover:bg-gray-50/5 transition-colors">
        <td className="px-4 py-3 font-medium text-sm">
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
        <td className="px-4 py-3 text-gray-500 text-sm">
          {new Date(doc.uploaded_at).toLocaleString()}
        </td>
        <td className="px-4 py-3 text-sm">
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleToggle}
              className="text-blue-400 hover:underline text-xs"
            >
              {expanded ? "Hide" : "View"}
            </button>
            <button
              type="button"
              onClick={handleDownloadSingle}
              className="text-green-400 hover:underline text-xs"
              title="Download result as CSV"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(doc.id)}
              className="text-red-400 hover:underline text-xs"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded preview + reconciliation result */}
      {expanded && (
        <tr className="border-t bg-gray-950">
          <td colSpan={6} className="px-6 py-5">
            <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
              {/* Image preview */}
              <div className="flex flex-col gap-2 min-w-0 lg:w-64">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Document Preview
                </p>
                {loadingPreview && (
                  <div className="w-full h-40 bg-gray-800 rounded-lg animate-pulse flex items-center justify-center">
                    <span className="text-gray-500 text-xs">Loading...</span>
                  </div>
                )}
                {previewUrl && doc.file_type === "pdf" && (
                  <div className="bg-gray-800 rounded-lg px-4 py-6 flex flex-col items-center gap-2">
                    <span className="text-4xl">📄</span>
                    <span className="text-xs text-gray-400">
                      {doc.original_filename}
                    </span>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs hover:underline"
                    >
                      Open PDF ↗
                    </a>
                  </div>
                )}
                {previewUrl && doc.file_type === "image" && (
                  <img
                    src={previewUrl}
                    alt={doc.original_filename}
                    className="rounded-lg border border-gray-700 max-w-full object-contain max-h-64"
                  />
                )}
                {doc.file_type === "excel" && (
                  <div className="bg-gray-800 rounded-lg px-4 py-6 flex flex-col items-center gap-2">
                    <span className="text-4xl">📊</span>
                    <span className="text-xs text-gray-400">
                      {doc.original_filename}
                    </span>
                  </div>
                )}

                {/* Multi-Currency Display */}
                {(doc.original_amount || doc.extracted_data) &&
                  !doc.extracted_data?.rows && (
                    <div className="flex flex-col gap-2 mt-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                        Payment Details
                      </p>

                      {/* Original Currency (what customer paid) */}
                      {doc.original_amount && doc.original_currency && (
                        <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg px-3 py-2">
                          <p className="text-xs text-blue-400 mb-1">
                            Original Amount
                          </p>
                          <p className="text-lg font-bold text-white">
                            {doc.original_currency}{" "}
                            {doc.original_amount.toFixed(2)}
                          </p>
                          {doc.transaction_date && (
                            <p className="text-xs text-gray-400 mt-1">
                              Date: {doc.transaction_date}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Base Currency (normalized for reconciliation) */}
                      {doc.base_amount &&
                        doc.original_currency !== doc.base_currency && (
                          <div className="bg-green-950/30 border border-green-800/50 rounded-lg px-3 py-2">
                            <p className="text-xs text-green-400 mb-1 flex items-center gap-2">
                              <span>Base Currency (Reconciliation)</span>
                              {doc.fx_rate_used && (
                                <span
                                  className="text-gray-500"
                                  title={`Historical FX rate used on ${doc.fx_rate_date || "transaction date"}`}
                                >
                                  @ {doc.fx_rate_used.toFixed(4)}
                                </span>
                              )}
                            </p>
                            <p className="text-lg font-bold text-green-300">
                              {doc.base_currency} {doc.base_amount.toFixed(2)}
                            </p>
                            {doc.fx_rate_date && (
                              <p className="text-xs text-gray-400 mt-1">
                                FX Rate Date: {doc.fx_rate_date}
                              </p>
                            )}
                          </div>
                        )}

                      {/* Additional fields */}
                      {doc.extracted_data && (
                        <div className="flex flex-col gap-1">
                          {doc.extracted_data.payer && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Payer:</span>
                              <span className="text-gray-300">
                                {doc.extracted_data.payer}
                              </span>
                            </div>
                          )}
                          {doc.extracted_data.payee && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-500">Payee:</span>
                              <span className="text-gray-300">
                                {doc.extracted_data.payee}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* Reconciliation result */}
              <div className="flex-1 flex flex-col gap-4">
                {/* Timeline */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                    Processing Timeline
                  </p>
                  <Timeline status={doc.workflow_status} caseId={doc.case_id} />
                </div>

                {!recon ? (
                  <p className="text-gray-500 text-sm">
                    No reconciliation has been run for this document yet.
                  </p>
                ) : (
                  <>
                    {/* Status + FX */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <AIResultBadge result={doc.ai_result} />
                        <WorkflowStatusBadge status={doc.workflow_status} />
                        {doc.risk_level && <RiskBadge level={doc.risk_level} />}
                        <span className="text-xs text-gray-500">
                          AI Confidence:{" "}
                          {Math.round((doc.ai_confidence ?? 0) * 100)}%
                        </span>
                      </div>

                      {proof && (
                        <div className="flex items-center gap-2 text-sm bg-gray-900 rounded-lg px-3 py-2">
                          <span className="text-white font-semibold">
                            {proof.currency} {proof.amount}
                          </span>
                          {fxResult && proof.currency !== "MYR" && (
                            <>
                              <span className="text-gray-500">→</span>
                              <span className="text-green-400 font-semibold">
                                MYR {fxResult.to_amount}
                              </span>
                              <span className="text-gray-500 text-xs">
                                @ {fxResult.rate}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Confidence bar */}
                    <div className="flex flex-col gap-1">
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
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

                    {/* AI Explanation (immutable) */}
                    {doc.ai_explanation && (
                      <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg px-4 py-3 flex flex-col gap-1">
                        <p className="text-xs text-blue-400 font-semibold flex items-center gap-2">
                          <span>🤖</span>
                          <span>AI Analysis (Original)</span>
                        </p>
                        <p className="text-xs text-gray-300 italic">
                          "{doc.ai_explanation}"
                        </p>
                      </div>
                    )}

                    {/* Agent explanation - legacy */}
                    {decision?.explanation && !doc.ai_explanation && (
                      <div className="bg-gray-900 rounded-lg px-4 py-3 flex flex-col gap-1">
                        <p className="text-xs text-gray-500 font-semibold">
                          Agent Analysis
                        </p>
                        <p className="text-xs text-gray-300">
                          {decision.explanation}
                        </p>
                        {decision.discrepancy_reason && (
                          <p className="text-xs text-yellow-400 mt-1">
                            ⚠ {decision.discrepancy_reason}
                          </p>
                        )}
                        {decision.suggested_action && (
                          <p className="text-xs text-blue-400">
                            → {decision.suggested_action}
                          </p>
                        )}
                        {decision.bank_fee_estimate && (
                          <p className="text-xs text-gray-500">
                            Est. bank fee: MYR {decision.bank_fee_estimate}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Match scores */}
                    {recon.match_scores?.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                          Match Scores
                        </p>
                        {recon.match_scores.map((s: any, i: number) => (
                          <div
                            key={i}
                            className={`grid grid-cols-3 gap-1 text-xs px-3 py-1.5 rounded-lg ${
                              decision?.matched_entry_index === i
                                ? "bg-green-950 border border-green-800"
                                : "bg-gray-900"
                            }`}
                          >
                            <span className="text-gray-400">Entry {i + 1}</span>
                            <span
                              className={
                                s.amount_match
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              Amt {s.amount_match ? "✓" : "✗"} (
                              {s.amount_diff_pct}%)
                            </span>
                            <span
                              className={
                                s.date_match ? "text-green-400" : "text-red-400"
                              }
                            >
                              Date {s.date_match ? "✓" : "✗"} ({s.days_apart}d)
                            </span>
                          </div>
                        ))}
                        {decision && (
                          <div className="mt-4 pt-4 border-t border-gray-800">
                            <ReviewPanel
                              documentId={doc.id}
                              finalStatus={decision.final_status}
                              matchScores={recon.match_scores}
                              confidence={decision.confidence}
                              currentReviewStatus={doc.review_status}
                              currentCaseId={doc.case_id}
                              currentRiskScore={doc.risk_score}
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
          </td>
        </tr>
      )}
    </>
  )
}

function downloadDocumentsCSV(docs: any[], filename: string) {
  const csvRows = [
    [
      "Document",
      "AI Result",
      "Confidence",
      "Original Amount",
      "Original Currency",
      "Base Amount",
      "Base Currency",
      "FX Rate",
      "Transaction Date",
      "Payer",
      "Payee",
      "Workflow Status",
      "Risk Level",
      "Explanation",
      "Uploaded At",
    ].join(","),
  ]

  for (const doc of docs) {
    const extracted = doc.extracted_data || {}
    csvRows.push(
      [
        `"${doc.original_filename || ""}"`,
        doc.ai_result || "",
        Math.round((doc.ai_confidence || 0) * 100),
        doc.original_amount || extracted.amount || "",
        doc.original_currency || extracted.currency || "",
        doc.base_amount || extracted.myr_amount || "",
        doc.base_currency || "MYR",
        doc.fx_rate_used || extracted.fx_rate || "",
        doc.transaction_date || extracted.date || "",
        `"${extracted.payer || ""}"`,
        `"${extracted.payee || ""}"`,
        doc.workflow_status || "",
        doc.risk_level || "",
        `"${(doc.ai_explanation || "").replace(/"/g, '""')}"`,
        new Date(doc.uploaded_at).toLocaleString(),
      ].join(","),
    )
  }

  const csvContent = csvRows.join("\n")
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

function HistoryPage() {
  const [filter, setFilter] = useState<string>("all")

  const { data, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  const filters = [
    { key: "all", label: "All", count: data?.data.length || 0 },
    {
      key: "needs_review",
      label: "Needs Review",
      count:
        data?.data.filter((d: any) => d.workflow_status === "PENDING_ACTION")
          .length || 0,
    },
    {
      key: "high_risk",
      label: "High Risk",
      count: data?.data.filter((d: any) => d.risk_level === "HIGH").length || 0,
    },
    {
      key: "exceptions",
      label: "Exceptions",
      count:
        data?.data.filter(
          (d: any) => d.workflow_status === "EXCEPTION_APPROVED",
        ).length || 0,
    },
    {
      key: "approved",
      label: "Approved",
      count:
        data?.data.filter((d: any) => d.workflow_status === "APPROVED")
          .length || 0,
    },
    {
      key: "under_review",
      label: "Under Review",
      count:
        data?.data.filter((d: any) => d.workflow_status === "UNDER_REVIEW")
          .length || 0,
    },
  ]

  const filteredDocs = data?.data.filter((doc: any) => {
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

  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Treasury Operations Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Autonomous cross-border payment reconciliation, discrepancy
          investigation, and exception management.
        </p>
      </div>

      {/* Smart Filters and Bulk Export */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                filter === f.key
                  ? "bg-blue-600 text-white border border-blue-500"
                  : "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600"
              }`}
            >
              {f.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  filter === f.key
                    ? "bg-blue-700 text-white"
                    : "bg-gray-700 text-gray-400"
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {filteredDocs && filteredDocs.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadDocumentsCSV(
                filteredDocs,
                `history_export_${filter}_${new Date().toISOString().split("T")[0]}.csv`,
              )
            }
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white border border-green-500 hover:bg-green-700 transition-all flex items-center gap-2"
          >
            📥 Export Filtered ({filteredDocs.length})
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : !data?.data.length ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No uploads yet. Go to Reconcile to upload a payment proof.
        </p>
      ) : !filteredDocs?.length ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No documents match the selected filter.
        </p>
      ) : (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-100/10 text-left">
            <tr>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Filename
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                AI Result
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Workflow Status
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Risk
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Uploaded
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.map((doc: any) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
