import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ReviewPanel } from "../../components/Common/ReviewPanel";
import { FilesService } from "../../client";

export const Route = createFileRoute("/_layout/history")({
  component: HistoryPage,
});

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    matched: "bg-green-900 text-green-300 border border-green-700",
    fuzzy: "bg-yellow-900 text-yellow-300 border border-yellow-700",
    unmatched: "bg-red-900 text-red-300 border border-red-700",
  };
  const labels: Record<string, string> = {
    matched: "✓ Matched",
    fuzzy: "~ Fuzzy Match",
    unmatched: "✗ Unmatched",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function DocumentRow({ doc }: { doc: any }) {
  const [expanded, setExpanded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => FilesService.deleteFile({ documentId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["my-documents"] }),
  });

  const handleToggle = async () => {
    if (!expanded && !previewUrl && doc.file_type !== "excel") {
      setLoadingPreview(true);
      try {
        const res = (await FilesService.getDownloadUrl({
          documentId: doc.id,
        })) as { url: string };
        setPreviewUrl(res.url);
      } catch {
        // preview unavailable
      } finally {
        setLoadingPreview(false);
      }
    }
    setExpanded((p) => !p);
  };

  const recon = doc.reconciliation_result;
  const decision = recon?.agent_decision;
  const fxResult = recon?.fx_result;
  const proof = recon?.proof;

  return (
    <>
      <tr className="border-t hover:bg-gray-50/5 transition-colors">
        <td className="px-4 py-3 font-medium text-sm">
          {doc.original_filename}
        </td>
        <td className="px-4 py-3 capitalize text-gray-500 text-sm">
          {doc.file_type}
        </td>
        <td className="px-4 py-3 text-sm">
          {doc.extracted_data ? (
            <span className="text-green-500 text-xs">✓ Extracted</span>
          ) : (
            <span className="text-gray-500 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          {decision ? (
            <StatusBadge status={decision.final_status} />
          ) : (
            <span className="text-gray-500 text-xs">—</span>
          )}
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
              {expanded ? "Hide" : "Preview"}
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

                {/* Extracted fields */}
                {doc.extracted_data && !doc.extracted_data.rows && (
                  <div className="flex flex-col gap-1 mt-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                      Extracted
                    </p>
                    {(
                      ["amount", "currency", "date", "payer", "payee"] as const
                    ).map((k) =>
                      doc.extracted_data[k] ? (
                        <div key={k} className="flex justify-between text-xs">
                          <span className="text-gray-500 capitalize">{k}</span>
                          <span className="text-gray-300">
                            {String(doc.extracted_data[k])}
                          </span>
                        </div>
                      ) : null,
                    )}
                    {doc.extracted_data.myr_amount &&
                      doc.extracted_data.currency !== "MYR" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">MYR equivalent</span>
                          <span className="text-green-400 font-medium">
                            MYR {doc.extracted_data.myr_amount}
                          </span>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Reconciliation result */}
              <div className="flex-1 flex flex-col gap-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                  Reconciliation Result
                </p>

                {!recon ? (
                  <p className="text-gray-500 text-sm">
                    No reconciliation has been run for this document yet.
                  </p>
                ) : (
                  <>
                    {/* Status + FX */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        {decision && (
                          <StatusBadge status={decision.final_status} />
                        )}
                        <span className="text-xs text-gray-500">
                          Confidence:{" "}
                          {Math.round((decision?.confidence ?? 0) * 100)}%
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

                    {/* Agent explanation */}
                    {decision?.explanation && (
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
                            className={`grid grid-cols-4 gap-1 text-xs px-3 py-1.5 rounded-lg ${
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
                            <span
                              className={
                                s.payer_match
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }
                            >
                              Payer {s.payer_match ? "✓" : "~"} (
                              {Math.round(s.payer_similarity * 100)}%)
                            </span>
                          </div>
                        ))}
                        {decision && (
                          <div className="mt-4 pt-4 border-t border-gray-800">
                            <ReviewPanel
                              documentId={doc.id}
                              currentStatus={doc.review_status}
                              currentNote={doc.review_note}
                              finalStatus={decision.final_status}
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
  );
}

function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  });

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Upload History</h1>
        <p className="text-gray-500 text-sm mt-1">
          All uploaded documents with extraction and reconciliation results.
        </p>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : !data?.data.length ? (
        <p className="text-gray-400 text-sm text-center mt-12">
          No uploads yet. Go to Reconcile to upload a payment proof.
        </p>
      ) : (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-100/10 text-left">
            <tr>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Filename
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Type
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Extracted
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">
                Match
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
            {data.data.map((doc: any) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
