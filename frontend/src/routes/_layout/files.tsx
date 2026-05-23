import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { FilesService } from "../../client"

export const Route = createFileRoute("/_layout/files")({
  component: DocumentsPage,
})

function DocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [extractResults, setExtractResults] = useState<Record<string, any>>({})
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  })

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => FilesService.deleteFile({ documentId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["my-documents"] }),
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await FilesService.uploadFile({ formData: { file } })
      queryClient.invalidateQueries({ queryKey: ["my-documents"] })
    } catch (err: any) {
      setError(err?.body?.detail ?? "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleExtract = async (documentId: string) => {
    setExtracting(documentId)
    try {
      const res = (await FilesService.extractDocument({ documentId })) as any
      setExtractResults((prev) => ({ ...prev, [documentId]: res }))
    } catch (err: any) {
      setExtractResults((prev) => ({
        ...prev,
        [documentId]: { error: err?.body?.detail ?? "Extraction failed" },
      }))
    } finally {
      setExtracting(null)
    }
  }

  const handleDownload = async (documentId: string, filename: string) => {
    const res = (await FilesService.getDownloadUrl({ documentId })) as {
      url: string
    }
    const a = document.createElement("a")
    a.href = res.url
    a.download = filename
    a.click()
  }

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Documents</h1>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,.xls,.xlsx,.csv"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload File"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : data?.data.length === 0 ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No documents yet. Upload a payment proof to get started.
        </p>
      ) : (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.data.map((doc) => (
              <>
                <tr key={doc.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {doc.original_filename}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-500">
                    {doc.file_type}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(doc.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => handleExtract(doc.id)}
                      disabled={extracting === doc.id}
                      className="text-green-500 hover:underline text-xs disabled:opacity-50"
                    >
                      {extracting === doc.id ? "Extracting..." : "Extract"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDownload(doc.id, doc.original_filename)
                      }
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      className="text-red-500 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>

                {/* Extraction results row */}
                {extractResults[doc.id] && (
                  <tr key={`${doc.id}-result`} className="bg-gray-900 border-t">
                    <td colSpan={4} className="px-4 py-3">
                      {extractResults[doc.id].error ? (
                        <p className="text-red-400 text-xs">
                          {extractResults[doc.id].error}
                        </p>
                      ) : extractResults[doc.id].rows ? (
                        // Excel — multiple rows
                        <div className="overflow-x-auto">
                          <table className="text-xs text-gray-300 w-full">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="pr-4 text-left">Date</th>
                                <th className="pr-4 text-left">Amount</th>
                                <th className="pr-4 text-left">Currency</th>
                                <th className="pr-4 text-left">MYR Amount</th>
                                <th className="pr-4 text-left">Rate</th>
                                <th className="pr-4 text-left">Payer</th>
                                <th className="pr-4 text-left">Payee</th>
                                <th className="text-left">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {extractResults[doc.id].rows.map(
                                (row: any, i: number) => (
                                  <tr
                                    key={i}
                                    className="border-t border-gray-800"
                                  >
                                    <td className="pr-4 py-1">
                                      {row.date ?? "—"}
                                    </td>
                                    <td className="pr-4">
                                      {row.amount ?? "—"}
                                    </td>
                                    <td className="pr-4">
                                      {row.currency ?? "—"}
                                    </td>
                                    <td className="pr-4 text-green-400">
                                      {row.myr_amount
                                        ? `MYR ${row.myr_amount}`
                                        : "—"}
                                    </td>
                                    <td className="pr-4 text-gray-500">
                                      {row.fx_rate ?? "—"}
                                    </td>
                                    <td className="pr-4">{row.payer ?? "—"}</td>
                                    <td className="pr-4">{row.payee ?? "—"}</td>
                                    <td>{row.description ?? "—"}</td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        // Image/PDF — single extraction
                        <div className="flex flex-col gap-3">
                          {/* FX conversion highlight */}
                          {extractResults[doc.id].extracted?.amount && (
                            <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3 text-sm">
                              <span className="text-white font-semibold">
                                {extractResults[doc.id].extracted.currency}{" "}
                                {extractResults[doc.id].extracted.amount}
                              </span>
                              {extractResults[doc.id].extracted.myr_amount &&
                              extractResults[doc.id].extracted.currency !==
                                "MYR" ? (
                                <>
                                  <span className="text-gray-500">→</span>
                                  <span className="text-green-400 font-semibold">
                                    MYR{" "}
                                    {
                                      extractResults[doc.id].extracted
                                        .myr_amount
                                    }
                                  </span>
                                  <span className="text-gray-500 text-xs">
                                    @ {extractResults[doc.id].extracted.fx_rate}
                                  </span>
                                </>
                              ) : (
                                <span className="text-gray-500 text-xs">
                                  Already in MYR
                                </span>
                              )}
                            </div>
                          )}

                          {/* Other fields */}
                          <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                            {(
                              [
                                "date",
                                "payer",
                                "payee",
                                "description",
                                "ocr_confidence",
                                "extraction_method",
                              ] as const
                            ).map((key) => {
                              const val =
                                extractResults[doc.id].extracted?.[key]
                              return val ? (
                                <div key={key}>
                                  <span className="text-gray-500 capitalize">
                                    {key.replace("_", " ")}:{" "}
                                  </span>
                                  <span
                                    className={
                                      key === "ocr_confidence"
                                        ? val === "high"
                                          ? "text-green-400"
                                          : "text-yellow-400"
                                        : ""
                                    }
                                  >
                                    {String(val)}
                                  </span>
                                </div>
                              ) : null
                            })}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
