import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { FilesService } from "../../client"

export const Route = createFileRoute("/_layout/history")({
  component: HistoryPage,
})

function HistoryPage() {
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
      <div>
        <h1 className="text-2xl font-bold">Upload History</h1>
        <p className="text-gray-500 text-sm mt-1">
          All previously uploaded payment proofs.
        </p>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : !data?.data.length ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No uploads yet. Uploaded payment receipts will appear here in your
          audit log.
        </p>
      ) : (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Extracted</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((doc: any) => (
              <tr key={doc.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {doc.original_filename}
                </td>
                <td className="px-4 py-3 capitalize text-gray-500">
                  {doc.file_type}
                </td>
                <td className="px-4 py-3">
                  {doc.extracted_data ? (
                    <span className="text-green-500 text-xs">✓ Yes</span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
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
