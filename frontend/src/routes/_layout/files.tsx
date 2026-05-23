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
            accept=".jpg,.jpeg,.png,.pdf,.xls,.xlsx"
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
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
