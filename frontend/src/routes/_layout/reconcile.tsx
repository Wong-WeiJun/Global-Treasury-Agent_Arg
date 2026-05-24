import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"
import useAuth from "@/hooks/useAuth"
import { FilesService, ReconciliationService } from "../../client"
import { ReviewPanel } from "../../components/Common/ReviewPanel"
import useCurrency from "../../hooks/useCurrency"
import { useUserRole } from "../../hooks/useUserRole"

export const Route = createFileRoute("/_layout/reconcile")({
  component: ReconcilePage,
})

interface BankEntry {
  id: string
  amount: string
  date: string
  description: string
  payer: string
}

interface DocumentWithEntries {
  docId: string
  docName: string
  extractedData: any
  bankEntries: BankEntry[]
  collapsed: boolean
  previewUrl?: string | null
  loadingPreview?: boolean
}

const emptyEntry = (defaultPayer = ""): BankEntry => ({
  id: crypto.randomUUID(),
  amount: "",
  date: "",
  description: "",
  payer: defaultPayer,
})

// ✅ Oggy67 — text-green-800 (darker, better contrast)
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched:
      "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
    fuzzy:
      "bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700",
    unmatched:
      "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  }
  const labels: Record<string, string> = {
    matched: "✓ Matched",
    fuzzy: "~ Fuzzy Match",
    unmatched: "✗ Unmatched",
  }
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

function ReconcilePage() {
  const navigate = useNavigate()
  const { canReconcile, role, isViewer } = useUserRole()
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const { baseCurrency, getSymbol, formatAmount } = useCurrency()

  const defaultUserIdentity = currentUser?.full_name || currentUser?.email || ""

  const [documentsWithEntries, setDocumentsWithEntries] = useState<
    DocumentWithEntries[]
  >([])
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ id: string; name: string; status: string }>
  >([])
  const [bulkReconciling, setBulkReconciling] = useState(false)
  const [bulkResults, setBulkResults] = useState<
    Array<{ docId: string; docName: string; result: any; error?: string }>
  >([])
  const [error, setError] = useState<string | null>(null)
  const [_csvImporting, setCsvImporting] = useState(false)

  const [previewModal, setPreviewModal] = useState<{
    url: string
    name: string
    fileType: string
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const { data: docs } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  useEffect(() => {
    if (!previewModal) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewModal(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [previewModal])

  useEffect(() => {
    if (role && !canReconcile) {
      navigate({ to: "/" })
    }
  }, [role, canReconcile, navigate])

  const toInputDate = (ddmmyyyy: string): string => {
    if (!ddmmyyyy) return ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(ddmmyyyy)) return ddmmyyyy
    const [dd, mm, yyyy] = ddmmyyyy.split("/")
    if (!dd || !mm || !yyyy) return ""
    return `${yyyy}-${mm}-${dd}`
  }

  const fromInputDate = (yyyymmdd: string): string => {
    if (!yyyymmdd) return ""
    const [yyyy, mm, dd] = yyyymmdd.split("-")
    if (!yyyy || !mm || !dd) return yyyymmdd
    return `${dd}/${mm}/${yyyy}`
  }

  const formatDisplayDate = (raw: string): string => {
    if (!raw) return "N/A"
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw
    const [yyyy, mm, dd] = raw.split("-")
    if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`
    return raw
  }

  const handleOpenPreview = async (
    docId: string,
    docName: string,
    fileType: string,
  ) => {
    if (fileType === "excel") return
    setPreviewLoading(true)
    try {
      const res = (await FilesService.getDownloadUrl({
        documentId: docId,
      })) as { url: string }
      setPreviewModal({ url: res.url, name: docName, fileType })
    } catch {
      /* fail gracefully */
    } finally {
      setPreviewLoading(false)
    }
  }

  if (isViewer) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <ShieldAlert className="size-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                Access Restricted
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                You do not have permission to access the Reconciliation page.
                This page is only available to Finance Managers, Admins, and
                Owners.
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Your current role: <strong>Viewer (Read-only)</strong>
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/" })}
                className="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md text-sm font-medium"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleDropdownSelectHistory = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const targetDocId = e.target.value
    if (!targetDocId) return

    const targetDoc = docs?.data.find((d: any) => d.id === targetDocId)
    if (!targetDoc) return

    if (documentsWithEntries.some((d) => d.docId === targetDocId)) {
      setError(
        "This document is already appended to your target tracking workbench.",
      )
      return
    }
    const extractedRows = targetDoc.extracted_data?.rows as any[] | undefined
    const normalizedExtractedData =
      extractedRows?.[0] || targetDoc.extracted_data || null

    setDocumentsWithEntries((prev) => [
      ...prev,
      {
        docId: targetDoc.id,
        docName: targetDoc.original_filename,
        extractedData: normalizedExtractedData,
        bankEntries: [emptyEntry(defaultUserIdentity)],
        collapsed: false,
      },
    ])
    e.target.value = ""
  }

  const handleBulkFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setError(null)
    setUploadedFiles([])

    const processFile = async (file: File) => {
      const tempId = `temp-${Date.now()}-${Math.random()}`
      setUploadedFiles((prev) => [
        ...prev,
        { id: tempId, name: file.name, status: "uploading" },
      ])

      try {
        const uploadRes = (await FilesService.uploadFile({
          formData: { file },
        })) as any
        const docId = uploadRes.document.id
        await FilesService.extractDocument({ documentId: docId })

        await queryClient.invalidateQueries({ queryKey: ["my-documents"] })
        const docsData = await FilesService.listMyDocuments()
        const doc = (docsData as any).data.find((d: any) => d.id === docId)

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { id: docId, name: file.name, status: "extracted" }
              : f,
          ),
        )
        const normalizedExtractedData =
          doc?.extracted_data?.rows?.[0] || doc?.extracted_data || null
        setDocumentsWithEntries((prev) => [
          ...prev,
          {
            docId,
            docName: file.name,
            extractedData: normalizedExtractedData || null,
            bankEntries: [emptyEntry(defaultUserIdentity)],
            collapsed: false,
          },
        ])

        return { success: true, docId }
      } catch (err: any) {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, status: "error" } : f)),
        )
        return { success: false, error: err }
      }
    }

    const concurrencyLimit = 3
    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit)
      await Promise.all(batch.map(processFile))
    }

    queryClient.invalidateQueries({ queryKey: ["my-documents"] })
  }

  const handleBulkReconcile = async () => {
    if (documentsWithEntries.length === 0) {
      setError("Please upload or select documents for bulk reconciliation.")
      return
    }

    const invalidDocs = documentsWithEntries.filter(
      (doc) => doc.bankEntries.filter((e) => e.amount && e.date).length === 0,
    )

    if (invalidDocs.length > 0) {
      setError(
        `Please add bank entries for: ${invalidDocs.map((d) => d.docName).join(", ")}`,
      )
      return
    }

    setBulkReconciling(true)
    setError(null)
    setBulkResults([])

    const reconcileDocument = async (docWithEntries: DocumentWithEntries) => {
      const validEntries = docWithEntries.bankEntries.filter(
        (e) => e.amount && e.date,
      )

      try {
        const res = (await ReconciliationService.reconcileDocument({
          requestBody: {
            document_id: docWithEntries.docId,
            bank_entries: validEntries.map((e) => ({
              amount: parseFloat(e.amount),
              date: toInputDate(e.date),
              description: e.description || undefined,
              payer: e.payer || undefined,
            })),
          },
        })) as any

        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: res.result,
          success: true,
        }
      } catch (err: any) {
        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: null,
          error: err?.body?.detail ?? "Reconciliation failed",
          success: false,
        }
      }
    }

    const concurrencyLimit = 5
    const results: any[] = []

    for (let i = 0; i < documentsWithEntries.length; i += concurrencyLimit) {
      const batch = documentsWithEntries.slice(i, i + concurrencyLimit)
      const batchResults = await Promise.all(batch.map(reconcileDocument))
      results.push(...batchResults)
      setBulkResults([...results])
    }

    setBulkReconciling(false)
    queryClient.invalidateQueries({ queryKey: ["my-documents"] })
  }

  const handleRetryFailed = async () => {
    const failedDocs = bulkResults
      .filter((r) => r.error)
      .map((r) => documentsWithEntries.find((d) => d.docId === r.docId))
      .filter(Boolean) as DocumentWithEntries[]

    if (failedDocs.length === 0) return
    setBulkReconciling(true)

    const reconcileDocument = async (docWithEntries: DocumentWithEntries) => {
      const validEntries = docWithEntries.bankEntries.filter(
        (e) => e.amount && e.date,
      )
      try {
        const res = (await ReconciliationService.reconcileDocument({
          requestBody: {
            document_id: docWithEntries.docId,
            bank_entries: validEntries.map((e) => ({
              amount: parseFloat(e.amount),
              date: toInputDate(e.date),
              description: e.description || undefined,
              payer: e.payer || undefined,
            })),
          },
        })) as any

        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: res.result,
          success: true,
        }
      } catch (err: any) {
        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: null,
          error: err?.body?.detail ?? "Reconciliation failed",
          success: false,
        }
      }
    }

    const retryResults = await Promise.all(failedDocs.map(reconcileDocument))
    setBulkResults((prev) =>
      prev.map((r) => retryResults.find((rr) => rr.docId === r.docId) || r),
    )
    setBulkReconciling(false)
    queryClient.invalidateQueries({ queryKey: ["my-documents"] })
  }

  // ✅ CSV date normalization
  const handleCSVImport = (
    docIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvImporting(true)
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const lines = text.split("\n").filter((line) => line.trim())
        const startIdx = lines[0].toLowerCase().includes("amount") ? 1 : 0

        const entries: BankEntry[] = lines
          .slice(startIdx)
          .map((line) => {
            const [amount, date, payer, description] = line
              .split(",")
              .map((s) => s.trim())
            // Normalise CSV date to dd/mm/yyyy
            return {
              id: crypto.randomUUID(),
              amount: amount || "",
              date: date ? fromInputDate(date) : "",
              payer: payer || "",
              description: description || "",
            }
          })
          .filter((e) => e.amount && e.date)

        if (entries.length > 0) {
          setDocumentsWithEntries((prev) =>
            prev.map((doc, idx) =>
              idx === docIndex ? { ...doc, bankEntries: entries } : doc,
            ),
          )
        } else {
          setError("CSV file contains no valid entries")
        }
      } catch (_err) {
        setError("Failed to parse CSV file")
      } finally {
        setCsvImporting(false)
      }
    }
    reader.readAsText(file)
  }

  const updateDocumentEntry = (
    docIndex: number,
    entryIndex: number,
    field: keyof BankEntry,
    value: string,
  ) => {
    setDocumentsWithEntries((prev) =>
      prev.map((doc, dIdx) =>
        dIdx === docIndex
          ? {
              ...doc,
              bankEntries: doc.bankEntries.map((entry, eIdx) =>
                eIdx === entryIndex ? { ...entry, [field]: value } : entry,
              ),
            }
          : doc,
      ),
    )
  }

  const addDocumentEntry = (docIndex: number) => {
    setDocumentsWithEntries((prev) =>
      prev.map((doc, idx) =>
        idx === docIndex
          ? {
              ...doc,
              bankEntries: [
                ...doc.bankEntries,
                emptyEntry(defaultUserIdentity),
              ],
            }
          : doc,
      ),
    )
  }

  const removeDocumentEntry = (docIndex: number, entryIndex: number) => {
    setDocumentsWithEntries((prev) =>
      prev.map((doc, idx) =>
        idx === docIndex
          ? {
              ...doc,
              bankEntries: doc.bankEntries.filter(
                (_, eIdx) => eIdx !== entryIndex,
              ),
            }
          : doc,
      ),
    )
  }

  const toggleDocumentCollapse = (docIndex: number) => {
    setDocumentsWithEntries((prev) =>
      prev.map((doc, idx) =>
        idx === docIndex ? { ...doc, collapsed: !doc.collapsed } : doc,
      ),
    )
  }

  const removeDocument = (docIndex: number) => {
    setDocumentsWithEntries((prev) => prev.filter((_, idx) => idx !== docIndex))
  }

  const downloadResultsCSV = (results: any[], filename: string) => {
    const csvRows = [
      [
        "Document",
        "AI Result",
        "Confidence",
        "Amount",
        "Currency",
        "Date",
        "Status",
        "Explanation",
      ].join(","),
    ]

    results.forEach((r) => {
      const decision = r.result?.agent_decision
      const proof = r.result?.proof
      csvRows.push(
        [
          r.docName,
          decision?.final_status || "error",
          decision?.confidence
            ? `${(decision.confidence * 100).toFixed(1)}%`
            : "N/A",
          proof?.amount || "N/A",
          proof?.currency || "N/A",
          proof?.date ? formatDisplayDate(proof.date) : "N/A",
          r.error ? "Error" : "Success",
          r.error || decision?.explanation?.replace(/,/g, ";") || "",
        ]
          .map((v) => `"${v}"`)
          .join(","),
      )
    })

    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Bulk Reconciliation</h1>
        {/* ✅ Oggy67 — semantic text-muted-foreground */}
        <p className="text-muted-foreground text-sm mt-1">
          Match multiple payment proofs concurrently against bank statement entries using AI pipelines.
        </p>
      </div>

      {/* Step 1: Upload or Select Section */}
      <section className="flex flex-col gap-4 border rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Step 1 — Choose Payment Proof Documents
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-1.5">
            {/* ✅ Oggy67 — semantic text-muted-foreground */}
            <label htmlFor="bulk-file-upload" className="text-xs text-muted-foreground font-medium">
              Upload New Documents (Parallel Pipeline Extraction)
            </label>
            <input
              id="bulk-file-upload"
              type="file"
              accept="image/jpeg,image/png,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              onChange={handleBulkFileChange}
              className="border rounded-lg px-3 py-1.5 text-sm bg-background file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
            />
            <p className="text-xs text-muted-foreground">
              Supports continuous native file uploads: Images, PDF, or XLSX spreadsheets.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="history-select-dropdown" className="text-xs text-muted-foreground font-medium">
              Select From Document History
            </label>
            <select
              id="history-select-dropdown"
              onChange={handleDropdownSelectHistory}
              defaultValue=""
              className="border rounded-lg px-4 py-2 text-sm bg-background w-full"
            >
              <option value="" disabled>
                Add a document from history...
              </option>
              {docs?.data
                .filter((d: any) => d.file_type !== "excel")
                .map((doc: any) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.original_filename} (
                    {new Date(doc.uploaded_at).toLocaleDateString("en-GB")})
                  </option>
                ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Selecting a document instantly appends it to your current workbench session below.
            </p>
          </div>
        </div>

        {/* Upload Status Pipeline Tracking */}
        {uploadedFiles.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs text-muted-foreground font-semibold">Upload Progress Trackers</p>
            <div className="flex flex-col gap-1">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-950 rounded-lg text-xs"
                >
                  <span className="text-foreground truncate flex-1">{file.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      file.status === "extracted"
                        ? "bg-green-900 text-green-300"
                        : file.status === "uploading"
                          ? "bg-blue-900 text-blue-300 animate-pulse"
                          : "bg-red-900 text-red-300"
                    }`}
                  >
                    {file.status === "extracted"
                      ? "✓ Ready"
                      : file.status === "uploading"
                        ? "⏳ Processing..."
                        : "✗ Error"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Main Documents Configuration Grid */}
      {documentsWithEntries.length > 0 && (
        <section className="flex flex-col gap-4 border rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Step 2 — Configure Bank Entries for Each Document
            </h2>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {documentsWithEntries.length} Active Workbench Profiles
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {documentsWithEntries.map((docWithEntries, docIdx) => {
              const docMeta = docs?.data.find(
                (d: any) => d.id === docWithEntries.docId,
              )
              const fileType = docMeta?.file_type ?? ""

              return (
                <div
                  key={docWithEntries.docId}

                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* Header Profile Info Bar */}
                  {/* ✅ Oggy67 — semantic bg-muted border-border */}
                  <div className="bg-muted px-4 py-3 flex items-center justify-between border-b border-border">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleDocumentCollapse(docIdx)}
                        className="text-muted-foreground hover:text-foreground text-xs font-mono"
                      >
                        {docWithEntries.collapsed ? "▶" : "▼"}
                      </button>
                      <div className="flex-1 min-w-0">
                        {/* ✅ Oggy67 — semantic text-foreground */}
                        <p className="font-medium text-sm truncate text-foreground">
                          {docWithEntries.docName}
                        </p>
                        {docWithEntries.extractedData && (
                          <p className="text-xs text-muted-foreground">
                            Extracted: {docWithEntries.extractedData.currency}{" "}
                            {docWithEntries.extractedData.amount}
                            {docWithEntries.extractedData.myr_amount &&
                              docWithEntries.extractedData.currency !==
                                baseCurrency && (
                                <>
                                  {" "}
                                  →{" "}
                                  {formatAmount(
                                    docWithEntries.extractedData.myr_amount,
                                    baseCurrency,
                                  )}
                                </>
                              )}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {fileType !== "excel" && (
                        <button
                          type="button"
                          disabled={previewLoading}
                          onClick={() =>
                            handleOpenPreview(
                              docWithEntries.docId,
                              docWithEntries.docName,
                              fileType,
                            )
                          }
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs px-2.5 py-1 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {previewLoading ? (
                            <span className="animate-pulse">Loading…</span>
                          ) : (
                            <>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-3 h-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              Preview
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDocument(docIdx)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs px-2 py-1 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                      >
                        Remove Target
                      </button>
                    </div>
                  </div>

                  {/* ✅ Oggy67 — smooth CSS animation on collapse */}
                  <div
                    style={{
                      maxHeight: docWithEntries.collapsed ? "0px" : "1200px",
                      opacity: docWithEntries.collapsed ? 0 : 1,
                      transition:
                        "max-height 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease",
                      overflow: "hidden",
                    }}
                  >
                    {/* ✅ Oggy67 — semantic bg-muted/30 */}
                    <div className="p-4 flex flex-col gap-4 bg-muted/30 dark:bg-black/10">
                      {docWithEntries.extractedData && (
                        <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/40 rounded-lg p-3">
                          {/* ✅ Oggy67 — text-blue-700 */}
                          <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold mb-2">
                            💡 AI Extracted Content Preview
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground block">Amount</span>

                              <span className="text-foreground font-medium font-mono">
                                {docWithEntries.extractedData.currency}{" "}
                                {docWithEntries.extractedData.amount}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Date</span>
                              <span className="text-foreground font-medium">
                                {formatDisplayDate(
                                  docWithEntries.extractedData.date,
                                )}
                              </span>
                            </div>
                            {docWithEntries.extractedData.payer && (
                              <div>
                                <span className="text-muted-foreground block">
                                  Extracted Payer
                                </span>
                                <span className="text-foreground font-medium truncate block">
                                  {docWithEntries.extractedData.payer}
                                </span>
                              </div>
                            )}
                            {docWithEntries.extractedData.myr_amount &&
                              docWithEntries.extractedData.currency !==
                                baseCurrency && (
                                <div>
                                  <span className="text-muted-foreground block">
                                    Converted to Base Currency
                                  </span>
                                  {/* ✅ Oggy67 — text-green-700 */}
                                  <span className="text-green-700 dark:text-green-400 font-semibold font-mono">
                                    {formatAmount(
                                      docWithEntries.extractedData.myr_amount,
                                      baseCurrency,
                                    )}
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      {/* Target Bank Statement Entry Allocation */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-semibold">
                            Bank Statement Entry Allocation
                          </p>
                          <div className="flex gap-3 text-xs">
                            {/* ✅ Oggy67 — text-blue-600 */}
                            <label className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                              Import Entry CSV
                              <input
                                type="file"
                                accept=".csv"
                                onChange={(e) => handleCSVImport(docIdx, e)}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => addDocumentEntry(docIdx)}
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              + Add Entry Row
                            </button>
                          </div>
                        </div>

                        {/* ✅ main — key={entry.id} needed for CSV-imported entries */}
                        {docWithEntries.bankEntries.map((entry, entryIdx) => (
                          <div
                            key={entry.id}
                            className="grid grid-cols-12 gap-2 items-center"
                          >
                            <input
                              type="number"
                              placeholder={`Amount (${getSymbol(baseCurrency)})`}
                              value={entry.amount}
                              onChange={(e) =>
                                updateDocumentEntry(
                                  docIdx,
                                  entryIdx,
                                  "amount",
                                  e.target.value,
                                )
                              }
                              className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                            />
                            <input
                              type="date"
                              value={toInputDate(entry.date)}
                              onChange={(e) =>
                                updateDocumentEntry(
                                  docIdx,
                                  entryIdx,
                                  "date",
                                  fromInputDate(e.target.value),
                                )
                              }

                              className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                            />
                            <input
                              type="text"
                              placeholder="Payer Identity"
                              value={entry.payer}
                              onChange={(e) =>
                                updateDocumentEntry(
                                  docIdx,
                                  entryIdx,
                                  "payer",
                                  e.target.value,
                                )
                              }
                              className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                            />
                            <input
                              type="text"
                              placeholder="Memo Description"
                              value={entry.description}
                              onChange={(e) =>
                                updateDocumentEntry(
                                  docIdx,
                                  entryIdx,
                                  "description",
                                  e.target.value,
                                )
                              }
                              className="col-span-2 border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeDocumentEntry(docIdx, entryIdx)
                              }
                              disabled={docWithEntries.bankEntries.length === 1}
                              className="col-span-1 text-red-600 dark:text-red-400 text-sm hover:text-red-700 dark:hover:text-red-300 disabled:opacity-20 text-center font-bold"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {error && (
        <div className="bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Primary Global Pipeline Call Execution Trigger */}
      <button
        type="button"
        onClick={handleBulkReconcile}
        disabled={bulkReconciling || documentsWithEntries.length === 0}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-40 shadow-md self-start transition-all"
      >
        {bulkReconciling
          ? `Processing ${documentsWithEntries.length} documents in parallel...`
          : `Run Bulk Reconciliation (${documentsWithEntries.length} docs)`}
      </button>

      {/* Bulk Results Visual Dashboard */}
      {bulkResults.length > 0 && (
        <section className="flex flex-col gap-4 border rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
          <div className="flex items-center justify-between flex-wrap gap-2">
            {/* ✅ Oggy67 — semantic text-foreground */}
            <h2 className="text-lg font-semibold text-foreground">Bulk Reconciliation Results</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {bulkResults.filter((r) => !r.error).length} / {bulkResults.length} Successful Operations
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadResultsCSV(
                    bulkResults,
                    `bulk-reconciliation-${Date.now()}.csv`,
                  )
                }
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center gap-1"
              >
                Download Results Sheet (CSV)
              </button>
              {bulkResults.some((r) => r.error) && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  disabled={bulkReconciling}
                  className="text-yellow-500 dark:text-yellow-400 hover:underline text-xs"
                >
                  Retry Failed
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {bulkResults.map((r) => {
              const decision = r.result?.agent_decision
              const proof = r.result?.proof
              const fxResult = r.result?.fx_result
              // ✅ Fixed from Oggy67 — was using undefined 'result' variable
              const hasError = !!r.error

              return (
                <div
                  key={r.docId}

                  className={`border rounded-lg p-4 transition-all ${
                    hasError
                      ? "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/10"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-foreground">{r.docName}</p>
                      {hasError ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono">
                          ✗ Error Details: {r.error}
                        </p>
                      ) : (
                        <div className="flex items-center gap-4 mt-2">
                          <StatusBadge status={decision?.final_status || "unknown"} />
                          <span className="text-xs text-muted-foreground font-mono">
                            Confidence Index: {Math.round((decision?.confidence ?? 0) * 100)}%
                          </span>
                          {proof && (
                            <span className="text-xs text-foreground font-mono">
                              {proof.currency} {proof.amount}
                              {fxResult && proof.currency !== "MYR" && (
                                <> → {formatAmount(fxResult.to_amount, baseCurrency)}</>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {!hasError && (
                      <button
                        type="button"
                        onClick={() => { navigate({ to: "/history" }) }}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                      >
                        Auditing File →
                      </button>
                    )}
                  </div>

                  {!hasError && decision?.explanation && (
                    <div className="mt-3 bg-muted rounded-lg px-3 py-2 border border-border">
                      <p className="text-xs text-muted-foreground italic">"{decision.explanation}"</p>
                    </div>
                  )}

                  {!hasError && r.result?.match_scores?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <ReviewPanel
                        documentId={r.docId}
                        finalStatus={decision.final_status}
                        matchScores={r.result.match_scores}
                        confidence={decision.confidence}
                        currentReviewStatus={null}
                        currentCaseId={null}
                        currentRiskScore={null}
                        onSaved={() =>
                          queryClient.invalidateQueries({
                            queryKey: ["my-documents"],
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ✅ Oggy67 — Aggregate Operations Stats Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div className="bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800/40 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-green-700 dark:text-green-400 font-semibold tracking-wide uppercase">
                Auto-Approved Matching
              </p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-400 font-mono mt-1">
                {
                  bulkResults.filter(
                    (r) => r.result?.agent_decision?.final_status === "matched",
                  ).length
                }
              </p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800/40 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-yellow-700 dark:text-yellow-400 font-semibold tracking-wide uppercase">
                Requires Verification Review
              </p>
              <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-400 font-mono mt-1">
                {
                  bulkResults.filter((r) => {
                    const status = r.result?.agent_decision?.final_status
                    return status === "fuzzy" || status === "unmatched"
                  }).length
                }
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800/40 rounded-lg p-4 shadow-sm">
              <p className="text-xs text-red-600 dark:text-red-400 font-semibold tracking-wide uppercase">
                Failed Processing Pipeline Exception
              </p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 font-mono mt-1">
                {bulkResults.filter((r) => r.error).length}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            {bulkResults.filter((r) => r.error).length > 0 && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={bulkReconciling}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Retry Failed Nodes ({bulkResults.filter((r) => r.error).length})
              </button>
            )}
            <button
              type="button"
              onClick={() => { navigate({ to: "/history" }) }}
              className="bg-muted hover:bg-muted/80 border border-border text-foreground px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              View All in History Dashboard →
            </button>
          </div>
        </section>
      )}

      {/* Document Preview Modal */}
      {previewModal && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setPreviewModal(null)}
          aria-label="Close preview"
        >
          <div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={previewModal?.name}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium truncate text-foreground">
                {previewModal.name}
              </p>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="text-muted-foreground hover:text-foreground text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto max-h-[80vh] p-2">
              {previewModal.fileType === "pdf" ? (
                <iframe
                  src={previewModal.url}
                  className="w-full h-[75vh] rounded"
                  title={previewModal.name}
                />
              ) : (
                <img
                  src={previewModal.url}
                  alt={previewModal.name}
                  className="max-w-full mx-auto rounded"
                />
              )}
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
