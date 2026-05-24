import { useState } from "react"
import { FilesService, ReviewService } from "../../client"

interface Props {
  documentId: string
  finalStatus: string
  matchScores?: any[]
  confidence?: number
  currentReviewStatus?: string | null
  currentCaseId?: string | null
  currentRiskScore?: number | null
  onSaved?: (record: any) => void
}

const EXCEPTION_TYPES = [
  {
    value: "BANK_FEE",
    label: "Bank Fee",
    description: "Intermediary bank deducted a fee",
  },
  {
    value: "PARTIAL_PAYMENT",
    label: "Partial Payment",
    description: "Only part of the invoice was paid",
  },
  {
    value: "FX_SPREAD",
    label: "FX Spread",
    description: "Exchange rate difference at time of transfer",
  },
  {
    value: "REFUND",
    label: "Refund",
    description: "This is a refund transaction",
  },
  {
    value: "SPLIT_PAYMENT",
    label: "Split Payment",
    description: "Paid across multiple transfers",
  },
  {
    value: "DUPLICATE",
    label: "Duplicate Payment",
    description: "Same invoice paid twice",
  },
  {
    value: "TAX_WITHHOLDING",
    label: "Tax Withholding",
    description: "Tax withheld at source",
  },
  {
    value: "MANUAL_ADJUSTMENT",
    label: "Manual Adjustment",
    description: "Accounting correction",
  },
  { value: "OTHER", label: "Other", description: "See notes" },
]

function RiskMeter({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-red-500" : score >= 40 ? "bg-yellow-500" : "bg-green-500"
  const label =
    score >= 70 ? "HIGH RISK" : score >= 40 ? "MEDIUM RISK" : "LOW RISK"
  const textColor =
    score >= 70
      ? "text-red-400"
      : score >= 40
        ? "text-yellow-400"
        : "text-green-400"
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-xs">
        <span className="text-gray-500">Risk Score</span>
        <span className={`font-bold ${textColor}`}>
          {score}/100 — {label}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

function ConfidenceMeter({ scores }: { scores: any[] }) {
  if (!scores?.length) return null
  const best = scores.reduce((a, b) => (a.score > b.score ? a : b), scores[0])
  const fields = [
    {
      label: "Amount match",
      value: Math.max(0, 100 - (best.amount_diff_pct || 0)),
      ok: best.amount_match,
    },
    {
      label: "Date proximity",
      value: Math.max(0, 100 - (best.days_apart || 0) * 10),
      ok: best.date_match,
    },
  ]
  return (
    <div className="flex flex-col gap-2 bg-gray-900 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
        AI Confidence Breakdown
      </p>
      {fields.map((f) => (
        <div key={f.label} className="flex flex-col gap-0.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">{f.label}</span>
            <span className={f.ok ? "text-green-400" : "text-red-400"}>
              {f.value.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${f.ok ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: `${Math.max(0, Math.min(100, f.value))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Timeline({
  status,
  caseId,
}: {
  status: string
  caseId?: string | null
}) {
  const steps = [
    { key: "PENDING_EXTRACTION", label: "Uploaded" },
    { key: "EXTRACTED", label: "Extracted" },
    { key: "PENDING_ACTION", label: "AI Analyzed" },
    { key: "APPROVED", label: "Finalized" },
  ]

  const statusOrder = [
    "PENDING_EXTRACTION",
    "EXTRACTED",
    "PENDING_ACTION",
    "APPROVED",
    "EXCEPTION_APPROVED",
    "UNDER_REVIEW",
    "REJECTED",
  ]

  const currentIdx = statusOrder.indexOf(status)

  return (
    <div className="flex items-center gap-0 text-xs">
      {steps.map((step, i) => {
        const stepIdx = statusOrder.indexOf(step.key)
        const done = stepIdx <= currentIdx
        const current = step.key === status
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex flex-col items-center gap-1 ${current ? "opacity-100" : done ? "opacity-70" : "opacity-30"}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  done ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className="text-gray-500 whitespace-nowrap">
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-8 mb-4 ${done ? "bg-green-600" : "bg-gray-700"}`}
              />
            )}
          </div>
        )
      })}
      {caseId && (
        <div className="ml-4 flex flex-col items-center gap-1">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-yellow-700 text-white text-xs font-bold">
            !
          </div>
          <span className="text-yellow-500 whitespace-nowrap">{caseId}</span>
        </div>
      )}
    </div>
  )
}

export function ReviewPanel({
  documentId,
  finalStatus,
  matchScores = [],
  confidence: _confidence,
  currentReviewStatus,
  currentCaseId: _currentCaseId,
  currentRiskScore,
  onSaved,
}: Props) {
  const [action, setAction] = useState<string>("")
  const [note, setNote] = useState("")
  const [exceptionType, setExceptionType] = useState("")
  const [priority, setPriority] = useState("medium")
  const [saving, setSaving] = useState(false)
  const [askingAI, setAskingAI] = useState(false)
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [saved, setSaved] = useState(!!currentReviewStatus)
  const [record, setRecord] = useState<any>(null)
  const [showJournal, setShowJournal] = useState(false)

  if (finalStatus === "matched" && !currentReviewStatus) return null

  const handleSave = async () => {
    if (!action) return
    if (action === "exception" && !exceptionType) return
    setSaving(true)
    try {
      const data = await ReviewService.reviewDocument({
        documentId,
        requestBody: {
          action,
          note: note || undefined,
          exception_type: exceptionType || undefined,
          priority: priority || undefined,
        },
      })
      setRecord(data)
      setSaved(true)
      onSaved?.(data)
    } catch (err: any) {
      console.error("Review failed:", err?.body ?? err)
    } finally {
      setSaving(false)
    }
  }
  const handleAskAI = async (question: string) => {
    setAskingAI(true)
    setAiAnswer(null)
    try {
      // Try generated client first
      let res: any
      try {
        res = await (FilesService as any).askAiQuestion({
          documentId,
          requestBody: { question },
        })
      } catch {
        // Fallback to raw fetch
        const { OpenAPI } = await import("../../client")
        const token =
          typeof OpenAPI.TOKEN === "function"
            ? await OpenAPI.TOKEN({} as any)
            : OpenAPI.TOKEN
        const raw = await fetch(
          `${OpenAPI.BASE}/api/v1/files/${documentId}/ask-ai`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question }),
          },
        )
        res = await raw.json()
      }
      setAiAnswer(res.answer)
    } catch (err: any) {
      setAiAnswer(`AI unavailable: ${err?.message ?? "unknown error"}`)
    } finally {
      setAskingAI(false)
    }
  }
  // Already reviewed — show summary
  if (saved && (currentReviewStatus || record)) {
    const reviewAction = record?.action ?? currentReviewStatus
    const statusConfig: Record<
      string,
      { badge: string; title: string; icon: string }
    > = {
      approved: {
        badge: "bg-green-900 border-green-700 text-green-300",
        title: "Approved & Ledger Updated",
        icon: "✓",
      },
      flagged: {
        badge: "bg-yellow-900 border-yellow-700 text-yellow-300",
        title: "Flagged for Investigation",
        icon: "⚠",
      },
      exception: {
        badge: "bg-blue-900 border-blue-700 text-blue-300",
        title: "Exception Recorded",
        icon: "📋",
      },
    }
    const cfg = statusConfig[reviewAction] ?? statusConfig.approved

    return (
      <div className="flex flex-col gap-4 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold border ${cfg.badge}`}
          >
            {cfg.icon} {cfg.title}
          </span>
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="text-gray-500 text-xs hover:underline"
          >
            Edit decision
          </button>
        </div>

        {record && (
          <>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-500">Confidence</p>
                <p className="text-white font-bold text-lg">
                  {Math.round(record.confidence * 100)}%
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-500">Risk Score</p>
                <p
                  className={`font-bold text-lg ${record.risk_score >= 70 ? "text-red-400" : record.risk_score >= 40 ? "text-yellow-400" : "text-green-400"}`}
                >
                  {record.risk_score}/100
                </p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <p className="text-gray-500">Record ID</p>
                <p className="text-gray-300 font-mono text-xs truncate">
                  {record.id?.slice(0, 8)}...
                </p>
              </div>
            </div>

            {record.case_id && (
              <div className="bg-yellow-950 border border-yellow-800 rounded-lg px-4 py-3">
                <p className="text-yellow-300 text-xs font-semibold">
                  Investigation Case Created
                </p>
                <p className="text-yellow-200 font-mono font-bold">
                  {record.case_id}
                </p>
                <p className="text-yellow-400 text-xs mt-1">
                  Assigned to: {record.assigned_to}
                </p>
              </div>
            )}

            {record.ai_explanation && (
              <div className="bg-gray-900 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 font-semibold mb-1">
                  AI Audit Explanation
                </p>
                <p className="text-sm text-gray-300 italic">
                  "{record.ai_explanation}"
                </p>
              </div>
            )}

            {record.journal_entry && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowJournal((p) => !p)}
                  className="text-blue-400 text-xs hover:underline self-start"
                >
                  {showJournal ? "Hide" : "View"} Journal Entry →
                </button>
                {showJournal && (
                  <div className="bg-gray-900 rounded-lg px-4 py-3 font-mono text-xs">
                    <p className="text-gray-500 mb-2">
                      Entry ID: {record.journal_entry.entry_id}
                    </p>
                    <p className="text-gray-500 mb-2">
                      Date: {record.journal_entry.date}
                    </p>
                    <table className="w-full">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left pr-4">Account</th>
                          <th className="text-right pr-4">Debit (MYR)</th>
                          <th className="text-right">Credit (MYR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.journal_entry.lines?.map(
                          (line: any, i: number) => (
                            <tr key={i} className="border-t border-gray-800">
                              <td className="pr-4 py-1">
                                <p className="text-gray-300">{line.account}</p>
                                <p className="text-gray-600 text-xs">
                                  {line.description}
                                </p>
                              </td>
                              <td className="text-right pr-4 text-green-400">
                                {line.debit ? line.debit.toFixed(2) : "—"}
                              </td>
                              <td className="text-right text-blue-400">
                                {line.credit ? line.credit.toFixed(2) : "—"}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                    {record.journal_entry.fx_note && (
                      <p className="text-gray-500 mt-2">
                        {record.journal_entry.fx_note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {record.risk_factors && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Risk Factors
                </p>
                {Object.entries(record.risk_factors).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-500 capitalize">
                      {k.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-300">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // Decision form
  return (
    <div className="flex flex-col gap-4 border border-gray-700 rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-300">
            {finalStatus === "fuzzy"
              ? "⚠ Fuzzy match — human decision required"
              : "✗ No match — action required"}
          </p>
        </div>
        <div className="bg-blue-950/30 border border-blue-800/50 rounded px-3 py-2">
          <p className="text-xs text-blue-400">
            <span className="font-semibold">Note:</span> Your decision will
            update the workflow status, but the original AI result will remain
            unchanged for audit purposes.
          </p>
        </div>
      </div>

      {/* Confidence meters */}
      <ConfidenceMeter scores={matchScores} />

      {/* Risk score */}
      {currentRiskScore != null && <RiskMeter score={currentRiskScore} />}

      {/* Ask AI */}
      <div className="flex gap-2 flex-wrap">
        {[
          "Why is this flagged?",
          "What should I do?",
          "Show risk analysis",
        ].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => handleAskAI(q)}
            disabled={askingAI}
            className="text-xs px-3 py-1.5 rounded-full border border-blue-700 bg-blue-950 text-blue-300 hover:bg-blue-900 disabled:opacity-50"
          >
            🤖 {q}
          </button>
        ))}
      </div>
      {askingAI && (
        <p className="text-xs text-blue-400 animate-pulse">Asking AI...</p>
      )}
      {aiAnswer && (
        <div className="bg-blue-950 border border-blue-800 rounded-lg px-4 py-3">
          <p className="text-xs text-blue-400 font-semibold mb-1">
            AI Response
          </p>
          <p className="text-sm text-blue-200">{aiAnswer}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Choose Action
        </p>

        <button
          type="button"
          onClick={() => setAction("approved")}
          className={`flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-all ${
            action === "approved"
              ? "border-green-700 bg-green-950 text-green-300"
              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
          }`}
        >
          <span className="text-sm font-semibold">✓ Approve</span>
          <span className="text-xs opacity-70">
            Accept match as financially correct — creates ledger entry
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAction("flagged")}
          className={`flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-all ${
            action === "flagged"
              ? "border-yellow-700 bg-yellow-950 text-yellow-300"
              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
          }`}
        >
          <span className="text-sm font-semibold">
            ⚠ Flag for Investigation
          </span>
          <span className="text-xs opacity-70">
            Creates investigation case, assigns to finance team, generates AI
            risk summary
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAction("exception")}
          className={`flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-all ${
            action === "exception"
              ? "border-blue-700 bg-blue-950 text-blue-300"
              : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
          }`}
        >
          <span className="text-sm font-semibold">📋 Mark as Exception</span>
          <span className="text-xs opacity-70">
            Reconcile with noted discrepancy — bank fee, partial payment, FX
            spread, etc.
          </span>
        </button>
      </div>

      {/* Action-specific fields */}
      {action === "flagged" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">Priority Level</p>
          <div className="flex gap-2">
            {["low", "medium", "high"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-3 py-1 rounded-full text-xs border font-medium capitalize ${
                  priority === p
                    ? p === "high"
                      ? "bg-red-950 border-red-700 text-red-300"
                      : p === "medium"
                        ? "bg-yellow-950 border-yellow-700 text-yellow-300"
                        : "bg-gray-800 border-gray-600 text-gray-300"
                    : "border-gray-700 text-gray-500"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {action === "exception" && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500">Exception Type</p>
          <div className="grid grid-cols-1 gap-1.5">
            {EXCEPTION_TYPES.map((et) => (
              <button
                key={et.value}
                type="button"
                onClick={() => setExceptionType(et.value)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                  exceptionType === et.value
                    ? "border-blue-700 bg-blue-950 text-blue-300"
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
                }`}
              >
                <span className="font-semibold">{et.label}</span>
                <span className="opacity-60">{et.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {action && (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === "approved"
                ? "Optional: reason for approval..."
                : action === "flagged"
                  ? "Describe what needs investigation..."
                  : "Optional: additional notes about the exception..."
            }
            rows={2}
            className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm bg-background text-gray-300 placeholder:text-gray-600 resize-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (action === "exception" && !exceptionType)}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 self-start"
          >
            {saving ? "Processing..." : "Confirm Decision"}
          </button>
        </div>
      )}
    </div>
  )
}
