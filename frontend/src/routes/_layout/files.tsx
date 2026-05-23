import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { FilesService, ReconciliationService } from "../../client"

export const Route = createFileRoute("/_layout/files")({
  component: ReconcileWorkflowPage,
})

interface BankEntry {
  amount: string
  date: string
  description: string
  payer: string
}

const emptyEntry = (): BankEntry => ({
  amount: "",
  date: "",
  description: "",
  payer: "",
})

type Step = "upload" | "extract" | "reconcile" | "result"

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "1. Upload" },
    { key: "extract", label: "2. Extract" },
    { key: "reconcile", label: "3. Match" },
    { key: "result", label: "4. Result" },
  ]
  const idx = steps.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              i < idx
                ? "bg-green-900 text-green-300"
                : i === idx
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-500"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-gray-600 text-xs">→</span>
          )}
        </div>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched: "bg-green-900 text-green-300 border border-green-700",
    fuzzy: "bg-yellow-900 text-yellow-300 border border-yellow-700",
    unmatched: "bg-red-900 text-red-300 border border-red-700",
  }
  const labels: Record<string, string> = {
    matched: "✓ Matched",
    fuzzy: "~ Fuzzy Match — Needs Review",
    unmatched: "✗ Unmatched — Flag for Investigation",
  }
  return (
    <span
      className={`px-4 py-2 rounded-full text-sm font-semibold ${styles[status] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function ReconcileWorkflowPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step state
  const [step, setStep] = useState<Step>("upload")

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadedDoc, setUploadedDoc] = useState<any>(null)

  // Extract state
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<any>(null)
  // Editable fields after extraction
  const [editAmount, setEditAmount] = useState("")
  const [editCurrency, setEditCurrency] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editPayer, setEditPayer] = useState("")
  const [editPayee, setEditPayee] = useState("")
  const [editDescription, setEditDescription] = useState("")

  // Reconcile state
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([emptyEntry()])
  const [reconciling, setReconciling] = useState(false)
  const [result, setResult] = useState<any>(null)

  const [error, setError] = useState<string | null>(null)

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const res = (await FilesService.uploadFile({
        formData: { file },
      })) as any
      setUploadedDoc(res.document)
      setStep("extract")
    } catch (err: any) {
      setError(err?.body?.detail ?? "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleExtract = async () => {
    if (!uploadedDoc) return
    setExtracting(true)
    setError(null)
    try {
      const res = (await FilesService.extractDocument({
        documentId: uploadedDoc.id,
      })) as any
      const data = res.extracted ?? {}
      setExtracted(res)
      setEditAmount(String(data.amount ?? ""))
      setEditCurrency(data.currency ?? "")
      setEditDate(data.date ?? "")
      setEditPayer(data.payer ?? "")
      setEditPayee(data.payee ?? "")
      setEditDescription(data.description ?? "")
      setStep("reconcile")
    } catch (err: any) {
      setError(err?.body?.detail ?? "Extraction failed")
    } finally {
      setExtracting(false)
    }
  }

  const addEntry = () => setBankEntries((p) => [...p, emptyEntry()])
  const removeEntry = (i: number) =>
    setBankEntries((p) => p.filter((_, idx) => idx !== i))
  const updateEntry = (i: number, f: keyof BankEntry, v: string) =>
    setBankEntries((p) => p.map((e, idx) => (idx === i ? { ...e, [f]: v } : e)))

  const handleReconcile = async () => {
    const valid = bankEntries.filter((e) => e.amount && e.date)
    if (valid.length === 0) {
      setError("Add at least one bank entry with amount and date.")
      return
    }
    setReconciling(true)
    setError(null)
    try {
      const res = (await ReconciliationService.reconcileDocument({
        requestBody: {
          document_id: uploadedDoc.id,
          bank_entries: valid.map((e) => ({
            amount: parseFloat(e.amount),
            date: e.date,
            description: e.description || undefined,
            payer: e.payer || undefined,
          })),
        },
      })) as any
      setResult(res.result)
      setStep("result")
    } catch (err: any) {
      setError(err?.body?.detail ?? "Reconciliation failed")
    } finally {
      setReconciling(false)
    }
  }

  const handleReset = () => {
    setStep("upload")
    setUploadedDoc(null)
    setExtracted(null)
    setResult(null)
    setError(null)
    setBankEntries([emptyEntry()])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const decision = result?.agent_decision
  const fxResult = result?.fx_result

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col">
      <h1 className="text-2xl font-bold mb-1">Treasury Reconciliation</h1>
      <p className="text-gray-500 text-sm mb-6">
        Upload a payment proof, extract details, and match against your bank
        statement.
      </p>

      <StepIndicator current={step} />

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="flex flex-col gap-4 border rounded-lg p-6">
          <h2 className="font-semibold">Upload Payment Proof</h2>
          <p className="text-gray-500 text-sm">
            Accepted: JPG, PNG, PDF (receipt, bank slip, invoice)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
          >
            {uploading ? "Uploading..." : "Choose File"}
          </button>
        </div>
      )}

      {/* ── Step 2: Extract ── */}
      {step === "extract" && uploadedDoc && (
        <div className="flex flex-col gap-4 border rounded-lg p-6">
          <h2 className="font-semibold">Extract Payment Details</h2>
          <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 text-sm">
            <span className="text-gray-400">Uploaded:</span>
            <span className="text-white font-medium">
              {uploadedDoc.original_filename}
            </span>
            <span className="text-gray-500 capitalize">
              {uploadedDoc.file_type}
            </span>
          </div>
          <p className="text-gray-500 text-sm">
            AI (OCR + Bedrock) will extract the amount, currency, date, payer,
            and payee from your document. You can edit the results before
            proceeding.
          </p>
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="bg-green-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
          >
            {extracting ? "Extracting..." : "Extract with AI"}
          </button>
        </div>
      )}

      {/* ── Step 3: Review + Bank Entries + Reconcile ── */}
      {step === "reconcile" && extracted && (
        <div className="flex flex-col gap-6">
          {/* Extracted fields — editable */}
          <div className="flex flex-col gap-4 border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Extracted Details</h2>
              {extracted.extracted?.ocr_confidence && (
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    extracted.extracted.ocr_confidence === "high"
                      ? "bg-green-900 text-green-300"
                      : "bg-yellow-900 text-yellow-300"
                  }`}
                >
                  OCR confidence: {extracted.extracted.ocr_confidence}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs">
              Review and correct if needed before matching.
            </p>

            {/* FX result if converted */}
            {extracted.extracted?.myr_amount &&
              extracted.extracted?.currency !== "MYR" && (
                <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 text-sm">
                  <span className="text-white font-semibold">
                    {extracted.extracted.currency} {extracted.extracted.amount}
                  </span>
                  <span className="text-gray-500">→</span>
                  <span className="text-green-400 font-semibold">
                    MYR {extracted.extracted.myr_amount}
                  </span>
                  <span className="text-gray-500 text-xs">
                    @ {extracted.extracted.fx_rate}
                  </span>
                </div>
              )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="edit-amount"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Amount
                </label>
                <input
                  id="edit-amount"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-currency"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Currency
                </label>
                <input
                  id="edit-currency"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-date"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Date
                </label>
                <input
                  id="edit-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-payer"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Payer
                </label>
                <input
                  id="edit-payer"
                  value={editPayer}
                  onChange={(e) => setEditPayer(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-payee"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Payee
                </label>
                <input
                  id="edit-payee"
                  value={editPayee}
                  onChange={(e) => setEditPayee(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-description"
                  className="text-xs text-gray-500 block mb-1"
                >
                  Description
                </label>
                <input
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>
            </div>
          </div>

          {/* Bank entries */}
          <div className="flex flex-col gap-4 border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Bank Statement Entries</h2>
              <button
                type="button"
                onClick={addEntry}
                className="text-blue-500 text-xs hover:underline"
              >
                + Add row
              </button>
            </div>
            <p className="text-gray-500 text-xs">
              Enter the entries from your bank statement to match against.
              Amount should be in MYR.
            </p>

            {bankEntries.map((entry, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="number"
                  placeholder="MYR amount"
                  value={entry.amount}
                  onChange={(e) => updateEntry(i, "amount", e.target.value)}
                  className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                />
                <input
                  type="date"
                  value={entry.date}
                  onChange={(e) => updateEntry(i, "date", e.target.value)}
                  className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                />
                <input
                  placeholder="Payer"
                  value={entry.payer}
                  onChange={(e) => updateEntry(i, "payer", e.target.value)}
                  className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                />
                <input
                  placeholder="Description"
                  value={entry.description}
                  onChange={(e) =>
                    updateEntry(i, "description", e.target.value)
                  }
                  className="col-span-2 border rounded-lg px-3 py-2 text-sm bg-background"
                />
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  disabled={bankEntries.length === 1}
                  className="col-span-1 text-red-400 text-xs hover:underline disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start mt-2"
            >
              {reconciling
                ? "Running AI Reconciliation..."
                : "Run Reconciliation"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ── */}
      {step === "result" && result && decision && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 border rounded-lg p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-semibold">Reconciliation Result</h2>
              <StatusBadge status={decision.final_status} />
            </div>

            {fxResult && (
              <div className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3 text-sm">
                <span className="text-white font-semibold">
                  {fxResult.from_currency} {fxResult.from_amount}
                </span>
                <span className="text-gray-500">→</span>
                <span className="text-green-400 font-semibold">
                  MYR {fxResult.to_amount}
                </span>
                <span className="text-gray-500 text-xs">
                  @ {fxResult.rate} on {fxResult.date}
                </span>
              </div>
            )}

            {/* Agent explanation */}
            <div className="flex flex-col gap-2 bg-gray-900 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-gray-300">
                Agent Analysis
              </p>
              <p className="text-sm text-gray-400">{decision.explanation}</p>
              {decision.discrepancy_reason && (
                <p className="text-sm text-yellow-400">
                  ⚠ {decision.discrepancy_reason}
                </p>
              )}
              {decision.suggested_action && (
                <p className="text-sm text-blue-400">
                  → {decision.suggested_action}
                </p>
              )}
              {decision.bank_fee_estimate && (
                <p className="text-sm text-gray-500">
                  Estimated bank fee: MYR {decision.bank_fee_estimate}
                </p>
              )}
            </div>

            {/* Confidence */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Confidence</span>
                <span>{Math.round((decision.confidence ?? 0) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    decision.final_status === "matched"
                      ? "bg-green-500"
                      : decision.final_status === "fuzzy"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${(decision.confidence ?? 0) * 100}%` }}
                />
              </div>
            </div>

            {/* Per-entry scores */}
            {result.match_scores?.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  Match Scores
                </p>
                {result.match_scores.map((s: any, i: number) => (
                  <div
                    key={i}
                    className={`grid grid-cols-4 gap-2 text-xs px-3 py-2 rounded-lg ${
                      decision.matched_entry_index === i
                        ? "bg-green-950 border border-green-800"
                        : "bg-gray-900"
                    }`}
                  >
                    <span className="text-gray-400">Entry {i + 1}</span>
                    <span
                      className={
                        s.amount_match ? "text-green-400" : "text-red-400"
                      }
                    >
                      Amount {s.amount_match ? "✓" : "✗"} ({s.amount_diff_pct}%)
                    </span>
                    <span
                      className={
                        s.date_match ? "text-green-400" : "text-red-400"
                      }
                    >
                      Date {s.date_match ? "✓" : "✗"} ({s.days_apart}d)
                    </span>
                    <span
                      className={
                        s.payer_match ? "text-green-400" : "text-yellow-400"
                      }
                    >
                      Payer {s.payer_match ? "✓" : "~"} (
                      {Math.round(s.payer_similarity * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="bg-gray-700 text-white px-6 py-3 rounded-lg text-sm font-medium self-start"
          >
            Start New Reconciliation
          </button>
        </div>
      )}
    </div>
  )
}
