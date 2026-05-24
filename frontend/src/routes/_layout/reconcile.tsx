import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { FilesService, ReconciliationService } from "../../client"
import { ReviewPanel, Timeline } from "../../components/Common/ReviewPanel"

export const Route = createFileRoute("/_layout/reconcile")({
  component: ReconcilePage,
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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched: "bg-green-900 text-green-300 border border-green-700",
    fuzzy: "bg-yellow-900 text-yellow-300 border border-yellow-700",
    unmatched: "bg-red-900 text-red-300 border border-red-700",
  }
  const labels: Record<string, string> = {
    matched: "✓ Matched",
    fuzzy: "~ Fuzzy Match",
    unmatched: "✗ Unmatched",
  }
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function ReconcilePage() {
  const [setRecord] = useState<any>(null)
  const queryClient = useQueryClient()
  const [selectedDocId, setSelectedDocId] = useState<string>("")
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([emptyEntry()])
  const [reconciling, setReconciling] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFileType, setSelectedFileType] = useState<string>("")

  // Fetch available documents
  const { data: docs } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  // Find the currently selected document to show its pre-extraction details
  const selectedDoc = docs?.data.find((d) => d.id === selectedDocId)

  // Cast extracted_data to a usable record structure safely for TS rendering
  const extractedData = selectedDoc?.extracted_data as
    | Record<string, any>
    | null
    | undefined

  // Combined Upload + Extract Mutation Flow
  const uploadAndExtractMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploadRes = (await FilesService.uploadFile({
        formData: { file },
      })) as any
      const docId = uploadRes.document.id
      const fileType = uploadRes.document.file_type
      await FilesService.extractDocument({ documentId: docId })
      return { docId, fileType }
    },
    onSuccess: async ({ docId, fileType }) => {
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
      setSelectedDocId(docId)
      setSelectedFileType(fileType)
      // Fetch presigned URL for preview
      try {
        const res = (await FilesService.getDownloadUrl({
          documentId: docId,
        })) as { url: string }
        setPreviewUrl(res.url)
      } catch {
        /* preview unavailable */
      }
    },
    onError: (err: any) => {
      setError(err?.body?.detail ?? "Upload or extraction failed.")
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setError(null)
      uploadAndExtractMutation.mutate(file)
    }
  }

  const handleDocSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedDocId(id)
    setPreviewUrl(null)
    if (!id) return
    const doc = docs?.data.find((d: any) => d.id === id)
    setSelectedFileType(doc?.file_type ?? "")
    try {
      const res = (await FilesService.getDownloadUrl({
        documentId: id,
      })) as { url: string }
      setPreviewUrl(res.url)
    } catch {
      /* unavailable */
    }
  }

  const addEntry = () => setBankEntries((prev) => [...prev, emptyEntry()])
  const removeEntry = (i: number) =>
    setBankEntries((prev) => prev.filter((_, idx) => idx !== i))
  const updateEntry = (i: number, field: keyof BankEntry, value: string) =>
    setBankEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)),
    )

  const handleReconcile = async () => {
    if (!selectedDocId) {
      setError("Please select or upload a payment proof document.")
      return
    }
    const validEntries = bankEntries.filter((e) => e.amount && e.date)
    if (validEntries.length === 0) {
      setError("Please add at least one bank entry with amount and date.")
      return
    }

    setReconciling(true)
    setError(null)
    setResult(null)

    try {
      const res = (await ReconciliationService.reconcileDocument({
        requestBody: {
          document_id: selectedDocId,
          bank_entries: validEntries.map((e) => ({
            amount: parseFloat(e.amount),
            date: e.date,
            description: e.description || undefined,
            payer: e.payer || undefined,
          })),
        },
      })) as any
      setResult(res.result)
    } catch (err: any) {
      setError(err?.body?.detail ?? "Reconciliation failed")
    } finally {
      setReconciling(false)
    }
  }

  const decision = result?.agent_decision

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Reconciliation</h1>
        <p className="text-gray-500 text-sm mt-1">
          Match a payment proof against bank statement entries using AI.
        </p>
      </div>

      {/* Step 1: Select or Upload document */}
      <section className="flex flex-col gap-3 border rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Step 1 — Payment Proof Document
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="file-upload"
              className="text-xs text-gray-400 font-medium"
            >
              Upload New Document
            </label>
            <input
              id="file-upload"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleFileChange}
              disabled={uploadAndExtractMutation.isPending}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="doc-select"
              className="text-xs text-gray-400 font-medium"
            >
              Or Select From History
            </label>
            <select
              id="doc-select"
              value={selectedDocId}
              onChange={handleDocSelect}
              className="border rounded-lg px-4 py-2 text-sm bg-background w-full"
            >
              <option value="">Select a document...</option>
              {docs?.data
                .filter((d) => d.file_type !== "excel")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.original_filename} (
                    {new Date(d.uploaded_at).toLocaleDateString()})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {uploadAndExtractMutation.isPending && (
          <p className="text-xs text-blue-400 animate-pulse mt-1">
            ⏳ Processing document with Bedrock AI extraction... Please wait.
          </p>
        )}

        {/* Safe extraction display by converting types explicitly */}
        {extractedData && (
          <div className="mt-2 text-xs bg-blue-950/40 border border-blue-900/60 rounded-lg p-3 flex flex-col gap-1">
            <span className="font-semibold text-blue-300">
              💡 AI Extracted Content Preview:
            </span>
            <div className="grid grid-cols-3 gap-2 text-gray-300 mt-1">
              <div>
                <strong>Amount:</strong> {String(extractedData.currency || "")}{" "}
                {String(extractedData.amount || "")}
              </div>
              <div>
                <strong>Date:</strong> {String(extractedData.date || "N/A")}
              </div>
              {extractedData.myr_amount && (
                <div className="text-green-400">
                  <strong>MYR Value:</strong> MYR{" "}
                  {String(extractedData.myr_amount)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Image preview */}
        {previewUrl && (
          <div className="flex flex-col gap-2 mt-2">
            {selectedFileType === "image" ? (
              <img
                src={previewUrl}
                alt="Payment proof preview"
                className="rounded-lg border border-gray-700 max-h-64 object-contain self-start"
              />
            ) : selectedFileType === "pdf" ? (
              <div className="bg-gray-900 rounded-lg px-4 py-4 flex items-center gap-3">
                <span className="text-3xl">📄</span>
                <div>
                  <p className="text-sm text-gray-300">
                    PDF uploaded successfully
                  </p>
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-xs hover:underline"
                  >
                    Open PDF ↗
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Step 2: Bank entries */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Step 2 — Bank Statement Entries
          </h2>
          <button
            type="button"
            onClick={addEntry}
            className="text-blue-500 text-xs hover:underline"
          >
            + Add row
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {bankEntries.map((entry, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                type="number"
                placeholder="Amount (MYR)"
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
                type="text"
                placeholder="Payer (optional)"
                value={entry.payer}
                onChange={(e) => updateEntry(i, "payer", e.target.value)}
                className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={entry.description}
                onChange={(e) => updateEntry(i, "description", e.target.value)}
                className="col-span-2 border rounded-lg px-3 py-2 text-sm bg-background"
              />
              <button
                type="button"
                onClick={() => removeEntry(i)}
                disabled={bankEntries.length === 1}
                className="col-span-1 text-red-400 text-xs hover:underline disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleReconcile}
        disabled={reconciling || uploadAndExtractMutation.isPending}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
      >
        {reconciling ? "Reconciling..." : "Run Reconciliation"}
      </button>

      {/* Result blocks */}
      {result && decision && (
        <section className="flex flex-col gap-4 border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Result</h2>
            <Timeline status="PENDING_ACTION" caseId={null} />
            <StatusBadge status={decision.final_status} />
          </div>

          {/* ... (keep your existing proof, explanation, and confidence bar logic here) ... */}

          {result.match_scores?.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Per-entry scores
              </p>
              {result.match_scores.map((s: any, i: number) => (
                <div
                  key={i}
                  className={`grid grid-cols-3 gap-2 text-xs px-3 py-2 rounded-lg ${
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
                    Amount {s.amount_match ? "✓" : "✗"} ({s.amount_diff_pct}%
                    diff)
                  </span>
                  <span
                    className={s.date_match ? "text-green-400" : "text-red-400"}
                  >
                    Date {s.date_match ? "✓" : "✗"} ({s.days_apart}d apart)
                  </span>
                  <span className="text-gray-500">—</span>
                </div>
              ))}
            </div>
          )}

          {/* Review Panel Section */}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <ReviewPanel
              documentId={selectedDocId}
              finalStatus={decision.final_status}
              matchScores={result.match_scores}
              confidence={decision.confidence}
              currentReviewStatus={null}
              currentCaseId={null}
              currentRiskScore={null}
              onSaved={(rec) => {
                setRecord(rec) // store audit record to show journal etc
              }}
            />
          </div>
        </section>
      )}
    </div>
  )
}