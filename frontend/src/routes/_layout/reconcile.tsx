import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import useAuth from "@/hooks/useAuth";
import { FilesService, ReconciliationService } from "../../client";
import { ReviewPanel, Timeline } from "../../components/Common/ReviewPanel";
import { useUserRole } from "../../hooks/useUserRole";

export const Route = createFileRoute("/_layout/reconcile")({
  component: ReconcilePage,
});

interface BankEntry {
  amount: string;
  date: string;
  description: string;
  payer: string;
}

interface DocumentWithEntries {
  docId: string;
  docName: string;
  extractedData: any;
  bankEntries: BankEntry[];
  collapsed: boolean;
}

const emptyEntry = (defaultPayer = ""): BankEntry => ({
  amount: "",
  date: "",
  description: "",
  payer: defaultPayer,
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
      className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] ?? "bg-gray-800 text-gray-300"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function ReconcilePage() {
  const navigate = useNavigate();
  const { canReconcile, role, isViewer } = useUserRole();
  const [setRecord] = useState<any>(null);
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const defaultUserIdentity =
    currentUser?.full_name || currentUser?.email || "";

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [documentsWithEntries, setDocumentsWithEntries] = useState<
    DocumentWithEntries[]
  >([]);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([
    emptyEntry(defaultUserIdentity),
  ]);
  const [reconciling, setReconciling] = useState(false);
  const [bulkReconciling, setBulkReconciling] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [bulkResults, setBulkResults] = useState<
    Array<{ docId: string; docName: string; result: any; error?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>("");
  const [_csvImporting, setCsvImporting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Sync state if initial rendering occurs prior to useAuth completing context collection
  useEffect(() => {
    if (
      defaultUserIdentity &&
      bankEntries.length === 1 &&
      bankEntries[0].payer === ""
    ) {
      setBankEntries([emptyEntry(defaultUserIdentity)]);
    }
  }, [defaultUserIdentity, bankEntries.length, bankEntries[0].payer]);

  // Listen for the Escape key to instantly drop out of full-screen view
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  // Fetch available documents (hook must be called unconditionally)
  const { data: docs } = useQuery({
    queryKey: ["my-documents"],
    queryFn: () => FilesService.listMyDocuments(),
  });

  // Find the currently selected document to show its pre-extraction details
  const selectedDoc = docs?.data.find((d) => d.id === selectedDocId);

  // Cast extracted_data to a usable record structure safely for TS rendering
  const extractedData = selectedDoc?.extracted_data as
    | Record<string, any>
    | null
    | undefined;

  // Combined Upload + Extract Mutation Flow
  const uploadAndExtractMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploadRes = (await FilesService.uploadFile({
        formData: { file },
      })) as any;
      const docId = uploadRes.document.id;
      const fileType = uploadRes.document.file_type;
      await FilesService.extractDocument({ documentId: docId });
      return { docId, fileType };
    },
    onSuccess: async ({ docId, fileType }) => {
      queryClient.invalidateQueries({ queryKey: ["my-documents"] });
      setSelectedDocId(docId);
      setSelectedFileType(fileType);
      // Fetch presigned URL for preview
      try {
        const res = (await FilesService.getDownloadUrl({
          documentId: docId,
        })) as { url: string };
        setPreviewUrl(res.url);
      } catch {
        /* preview unavailable */
      }
    },
    onError: (err: any) => {
      setError(err?.body?.detail ?? "Upload or extraction failed.");
    },
  });

  // Redirect viewers to dashboard
  useEffect(() => {
    if (role && !canReconcile) {
      navigate({ to: "/" });
    }
  }, [role, canReconcile, navigate]);

  // Show access denied for viewers (after all hooks are called)
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
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setError(null);

      // Check if it's a CSV file
      if (file.name.toLowerCase().endsWith(".csv")) {
        handleCSVPaymentProofUpload(file);
      } else {
        uploadAndExtractMutation.mutate(file);
      }
    }
  };

  // Handle CSV payment proof upload
  const handleCSVPaymentProofUpload = async (file: File) => {
    setCsvImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        // Expected format: amount,currency,date,payer,payee,description
        const startIdx = lines[0].toLowerCase().includes("amount") ? 1 : 0;

        const proofData = lines
          .slice(startIdx)
          .map((line) => {
            const [amount, currency, date, payer, payee, description] = line
              .split(",")
              .map((s) => s.trim());
            return {
              amount: parseFloat(amount),
              currency: currency || "MYR",
              date: date || "",
              payer: payer || "",
              payee: payee || "",
              description: description || "",
            };
          })
          .filter((e) => e.amount && e.date);

        if (proofData.length === 0) {
          setError("CSV file contains no valid payment proof entries");
          setCsvImporting(false);
          return;
        }

        // For single mode, use first entry
        if (mode === "single") {
          const proof = proofData[0];
          // Create a mock document with CSV data
          setSelectedDocId(`csv-${Date.now()}`);
          setResult({
            proof,
            agent_decision: {
              final_status: "unmatched",
              confidence: 0,
              explanation: "CSV import - please add bank entries to reconcile",
            },
          });
        } else {
          // For bulk mode, create documents for each CSV row
          proofData.forEach((proof, idx) => {
            setDocumentsWithEntries((prev) => [
              ...prev,
              {
                docId: `csv-${Date.now()}-${idx}`,
                docName: `CSV Entry ${idx + 1}: ${proof.currency} ${proof.amount}`,
                extractedData: proof,
                bankEntries: [emptyEntry(defaultUserIdentity)],
                collapsed: false,
              },
            ]);
          });
        }

        setCsvImporting(false);
      } catch (_err) {
        setError("Failed to parse CSV payment proof file");
        setCsvImporting(false);
      }
    };

    reader.readAsText(file);
  };

  // Bulk upload handler with parallel processing
  const handleBulkFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setUploadedFiles([]);

    // Process files in parallel with concurrency limit of 3
    const processFile = async (file: File) => {
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      setUploadedFiles((prev) => [
        ...prev,
        { id: tempId, name: file.name, status: "uploading" },
      ]);

      try {
        const uploadRes = (await FilesService.uploadFile({
          formData: { file },
        })) as any;
        const docId = uploadRes.document.id;
        await FilesService.extractDocument({ documentId: docId });

        // Fetch the updated document with extracted data
        await queryClient.invalidateQueries({ queryKey: ["my-documents"] });
        const docsData = await FilesService.listMyDocuments();
        const doc = (docsData as any).data.find((d: any) => d.id === docId);

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { id: docId, name: file.name, status: "extracted" }
              : f,
          ),
        );

        // Add to documents with entries
        setDocumentsWithEntries((prev) => [
          ...prev,
          {
            docId,
            docName: file.name,
            extractedData: doc?.extracted_data || null,
            bankEntries: [emptyEntry()],
            collapsed: false,
          },
        ]);

        return { success: true, docId };
      } catch (err: any) {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, status: "error" } : f)),
        );
        return { success: false, error: err };
      }
    };

    // Process with concurrency limit
    const concurrencyLimit = 3;
    const results = [];
    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(batch.map(processFile));
      results.push(...batchResults);
    }

    queryClient.invalidateQueries({ queryKey: ["my-documents"] });
  };

  // Handle selecting existing documents for bulk
  const handleToggleDocument = async (docId: string) => {
    const exists = documentsWithEntries.find((d) => d.docId === docId);

    if (exists) {
      // Remove from selection
      setDocumentsWithEntries((prev) => prev.filter((d) => d.docId !== docId));
    } else {
      // Add to selection - fetch document data
      const doc = docs?.data.find((d: any) => d.id === docId);
      if (doc) {
        setDocumentsWithEntries((prev) => [
          ...prev,
          {
            docId: doc.id,
            docName: doc.original_filename,
            extractedData: doc.extracted_data,
            bankEntries: [emptyEntry()],
            collapsed: true,
          },
        ]);
      }
    }
  };

  // CSV Import for bank entries
  const handleCSVImport = (
    docIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvImporting(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        // Skip header if present
        const startIdx = lines[0].toLowerCase().includes("amount") ? 1 : 0;

        const entries: BankEntry[] = lines
          .slice(startIdx)
          .map((line) => {
            const [amount, date, payer, description] = line
              .split(",")
              .map((s) => s.trim());
            return {
              amount: amount || "",
              date: date || "",
              payer: payer || "",
              description: description || "",
            };
          })
          .filter((e) => e.amount && e.date);

        if (entries.length > 0) {
          setDocumentsWithEntries((prev) =>
            prev.map((doc, idx) =>
              idx === docIndex ? { ...doc, bankEntries: entries } : doc,
            ),
          );
        } else {
          setError("CSV file contains no valid entries");
        }
      } catch (_err) {
        setError("Failed to parse CSV file");
      } finally {
        setCsvImporting(false);
      }
    };

    reader.readAsText(file);
  };

  const handleBulkReconcile = async () => {
    if (documentsWithEntries.length === 0) {
      setError("Please upload or select documents for bulk reconciliation.");
      return;
    }

    // Validate each document has at least one bank entry
    const invalidDocs = documentsWithEntries.filter(
      (doc) => doc.bankEntries.filter((e) => e.amount && e.date).length === 0,
    );

    if (invalidDocs.length > 0) {
      setError(
        `Please add bank entries for: ${invalidDocs.map((d) => d.docName).join(", ")}`,
      );
      return;
    }

    setBulkReconciling(true);
    setError(null);
    setBulkResults([]);

    // Parallel processing with concurrency limit of 5
    const reconcileDocument = async (docWithEntries: DocumentWithEntries) => {
      const validEntries = docWithEntries.bankEntries.filter(
        (e) => e.amount && e.date,
      );

      try {
        const res = (await ReconciliationService.reconcileDocument({
          requestBody: {
            document_id: docWithEntries.docId,
            bank_entries: validEntries.map((e) => ({
              amount: parseFloat(e.amount),
              date: e.date,
              description: e.description || undefined,
              payer: e.payer || undefined,
            })),
          },
        })) as any;

        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: res.result,
          success: true,
        };
      } catch (err: any) {
        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: null,
          error: err?.body?.detail ?? "Reconciliation failed",
          success: false,
        };
      }
    };

    // Process in batches of 5 for parallel execution
    const concurrencyLimit = 5;
    const results: Array<{
      docId: string;
      docName: string;
      result: any;
      error?: string;
      success?: boolean;
    }> = [];

    for (let i = 0; i < documentsWithEntries.length; i += concurrencyLimit) {
      const batch = documentsWithEntries.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(batch.map(reconcileDocument));
      results.push(...batchResults);

      // Update progress
      setBulkResults([...results]);
    }

    setBulkReconciling(false);
    queryClient.invalidateQueries({ queryKey: ["my-documents"] });
  };

  // Retry failed documents
  const handleRetryFailed = async () => {
    const failedDocs = bulkResults
      .filter((r) => r.error)
      .map((r) => documentsWithEntries.find((d) => d.docId === r.docId))
      .filter(Boolean) as DocumentWithEntries[];

    if (failedDocs.length === 0) return;

    setBulkReconciling(true);

    const reconcileDocument = async (docWithEntries: DocumentWithEntries) => {
      const validEntries = docWithEntries.bankEntries.filter(
        (e) => e.amount && e.date,
      );

      try {
        const res = (await ReconciliationService.reconcileDocument({
          requestBody: {
            document_id: docWithEntries.docId,
            bank_entries: validEntries.map((e) => ({
              amount: parseFloat(e.amount),
              date: e.date,
              description: e.description || undefined,
              payer: e.payer || undefined,
            })),
          },
        })) as any;

        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: res.result,
          success: true,
        };
      } catch (err: any) {
        return {
          docId: docWithEntries.docId,
          docName: docWithEntries.docName,
          result: null,
          error: err?.body?.detail ?? "Reconciliation failed",
          success: false,
        };
      }
    };

    const retryResults = await Promise.all(failedDocs.map(reconcileDocument));

    // Update results - replace failed with retry results
    setBulkResults((prev) =>
      prev.map((r) => {
        const retryResult = retryResults.find((rr) => rr.docId === r.docId);
        return retryResult || r;
      }),
    );

    setBulkReconciling(false);
    queryClient.invalidateQueries({ queryKey: ["my-documents"] });
  };

  // Helper functions for managing document entries
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
    );
  };

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
    );
  };

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
    );
  };

  const toggleDocumentCollapse = (docIndex: number) => {
    setDocumentsWithEntries((prev) =>
      prev.map((doc, idx) =>
        idx === docIndex ? { ...doc, collapsed: !doc.collapsed } : doc,
      ),
    );
  };

  const removeDocument = (docIndex: number) => {
    setDocumentsWithEntries((prev) =>
      prev.filter((_, idx) => idx !== docIndex),
    );
  };

  const handleDocSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedDocId(id);
    setPreviewUrl(null);
    if (!id) return;
    const doc = docs?.data.find((d: any) => d.id === id);
    setSelectedFileType(doc?.file_type ?? "");
    try {
      const res = (await FilesService.getDownloadUrl({
        documentId: id,
      })) as { url: string };
      setPreviewUrl(res.url);
    } catch {
      /* unavailable */
    }
  };

  const addEntry = () =>
    setBankEntries((prev) => [...prev, emptyEntry(defaultUserIdentity)]);
  const removeEntry = (i: number) =>
    setBankEntries((prev) => prev.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, field: keyof BankEntry, value: string) =>
    setBankEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)),
    );

  // CSV import for single mode bank entries
  const handleSingleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvImporting(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        // Skip header if present
        const startIdx = lines[0].toLowerCase().includes("amount") ? 1 : 0;

        const entries: BankEntry[] = lines
          .slice(startIdx)
          .map((line) => {
            const [amount, date, payer, description] = line
              .split(",")
              .map((s) => s.trim());
            return {
              amount: amount || "",
              date: date || "",
              payer: payer || "",
              description: description || "",
            };
          })
          .filter((e) => e.amount && e.date);

        if (entries.length > 0) {
          setBankEntries(entries);
        } else {
          setError("CSV file contains no valid entries");
        }
      } catch (_err) {
        setError("Failed to parse CSV file");
      } finally {
        setCsvImporting(false);
      }
    };

    reader.readAsText(file);
  };

  // Download results as CSV
  const downloadResultsCSV = (results: any, filename: string) => {
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
    ];

    if (Array.isArray(results)) {
      // Bulk results
      results.forEach((r) => {
        const decision = r.result?.agent_decision;
        const proof = r.result?.proof;
        csvRows.push(
          [
            r.docName,
            decision?.final_status || "error",
            decision?.confidence
              ? `${(decision.confidence * 100).toFixed(1)}%`
              : "N/A",
            proof?.amount || "N/A",
            proof?.currency || "N/A",
            proof?.date || "N/A",
            r.error ? "Error" : "Success",
            r.error || decision?.explanation?.replace(/,/g, ";") || "",
          ]
            .map((v) => `"${v}"`)
            .join(","),
        );
      });
    } else {
      // Single result
      const decision = results?.agent_decision;
      const proof = results?.proof;
      csvRows.push(
        [
          selectedDoc?.original_filename || "document",
          decision?.final_status || "unknown",
          decision?.confidence
            ? `${(decision.confidence * 100).toFixed(1)}%`
            : "N/A",
          proof?.amount || "N/A",
          proof?.currency || "N/A",
          proof?.date || "N/A",
          "Success",
          decision?.explanation?.replace(/,/g, ";") || "",
        ]
          .map((v) => `"${v}"`)
          .join(","),
      );
    }

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleReconcile = async () => {
    if (!selectedDocId) {
      setError("Please select or upload a payment proof document.");
      return;
    }
    const validEntries = bankEntries.filter((e) => e.amount && e.date);
    if (validEntries.length === 0) {
      setError("Please add at least one bank entry with amount and date.");
      return;
    }

    setReconciling(true);
    setError(null);
    setResult(null);

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
      })) as any;
      setResult(res.result);
    } catch (err: any) {
      setError(err?.body?.detail ?? "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  const decision = result?.agent_decision;

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reconciliation</h1>
          <p className="text-gray-500 text-sm mt-1">
            Match payment proofs against bank statement entries using AI.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
          <button
            type="button"
            onClick={() => {
              setMode("single");
              setDocumentsWithEntries([]);
              setUploadedFiles([]);
              setBulkResults([]);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "single"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Single Mode
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("bulk");
              setSelectedDocId("");
              setResult(null);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "bulk"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Bulk Mode
          </button>
        </div>
      </div>

      {/* Step 1: Select or Upload document */}
      {mode === "single" && (
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
                Upload New Document (or CSV Payment Proof)
              </label>
              <input
                id="file-upload"
                type="file"
                accept="image/jpeg,image/png,application/pdf,.csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                disabled={uploadAndExtractMutation.isPending}
                className="border rounded-lg px-3 py-1.5 text-sm bg-background file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <p className="text-xs text-gray-500">
                Supports: Images, PDF, CSV, or XLSX
                (amount,currency,date,payer,payee,description)
              </p>
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

          {/* Multi-Currency Extraction Display */}
          {(selectedDoc?.original_amount || extractedData) && (
            <div className="mt-2 bg-blue-950/40 border border-blue-900/60 rounded-lg p-3 flex flex-col gap-2">
              <span className="text-xs font-semibold text-blue-300">
                💡 AI Extracted Content Preview
              </span>

              {/* Original Currency */}
              {selectedDoc?.original_amount &&
                selectedDoc?.original_currency && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">Original Amount</p>
                      <p className="text-sm font-bold text-white">
                        {selectedDoc.original_currency}{" "}
                        {selectedDoc.original_amount.toFixed(2)}
                      </p>
                    </div>

                    {/* Base Currency */}
                    {selectedDoc.base_amount &&
                      selectedDoc.original_currency !==
                        selectedDoc.base_currency && (
                        <>
                          <span className="text-gray-500">→</span>
                          <div className="flex-1">
                            <p className="text-xs text-gray-400">
                              Base Currency
                            </p>
                            <p className="text-sm font-bold text-green-300">
                              {selectedDoc.base_currency}{" "}
                              {selectedDoc.base_amount.toFixed(2)}
                            </p>
                            {selectedDoc.fx_rate_used && (
                              <p className="text-xs text-gray-500">
                                @ {selectedDoc.fx_rate_used.toFixed(4)}
                              </p>
                            )}
                          </div>
                        </>
                      )}

                    {selectedDoc.transaction_date && (
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">Date</p>
                        <p className="text-sm text-gray-300">
                          {selectedDoc.transaction_date}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {/* Fallback to extracted_data if new fields not populated yet */}
              {!selectedDoc?.original_amount && extractedData && (
                <div className="grid grid-cols-3 gap-2 text-gray-300 text-xs">
                  <div>
                    <strong>Amount:</strong>{" "}
                    {String(extractedData.currency || "")}{" "}
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
              )}
            </div>
          )}

          {/* Image preview */}
          {previewUrl && (
            <div className="flex flex-col gap-2 mt-2">
              {selectedFileType === "image" ? (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="group relative block text-left focus:outline-none rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors cursor-zoom-in self-start max-h-64"
                >
                  <img
                    src={previewUrl}
                    alt="Payment proof preview"
                    className="rounded-lg max-h-64 object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                    <span className="bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-md">
                      View Full Size
                    </span>
                  </div>
                </button>
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

          {/* Excel file indicator */}
          {selectedFileType === "excel" && (
            <div className="bg-gray-900 rounded-lg px-4 py-4 flex items-center gap-3 mt-2">
              <span className="text-3xl">📊</span>
              <div>
                <p className="text-sm text-gray-300">
                  XLSX file uploaded successfully
                </p>
                <p className="text-xs text-gray-500">
                  Structured data extracted from spreadsheet
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Bulk Mode - Step 1: Upload Multiple Documents */}
      {mode === "bulk" && (
        <section className="flex flex-col gap-4 border rounded-lg p-4 bg-gray-100 dark:bg-gray-900">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Step 1 — Upload Payment Proof Documents (Bulk)
          </h2>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-file-upload"
                className="text-xs text-gray-400 font-medium"
              >
                Upload Multiple Documents
              </label>
              <input
                id="bulk-file-upload"
                type="file"
                accept="image/jpeg,image/png,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                onChange={handleBulkFileChange}
                className="border rounded-lg px-3 py-1.5 text-sm bg-background file:mr-4 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <p className="text-xs text-gray-500">
                You can select multiple files at once (Ctrl/Cmd + Click).
                Supports: Images, PDF, or XLSX.
              </p>
            </div>

            {/* Or select from history */}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400 font-medium">
                Or Select From History
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-gray-950">
                {docs?.data
                  .filter((d: any) => d.file_type !== "excel")
                  .map((doc: any) => {
                    const isSelected = documentsWithEntries.some(
                      (dwe) => dwe.docId === doc.id,
                    );
                    return (
                      <label
                        key={doc.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-blue-950 border-blue-700 text-blue-300"
                            : "bg-gray-900 border-gray-700 hover:border-gray-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleDocument(doc.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-xs font-medium truncate">
                            {doc.original_filename}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </span>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>

            {/* Uploaded files status */}
            {uploadedFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 font-semibold">
                  Upload Progress
                </p>
                <div className="flex flex-col gap-1">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between px-3 py-2 bg-gray-950 rounded-lg text-xs"
                    >
                      <span className="text-gray-300 truncate flex-1">
                        {file.name}
                      </span>
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
          </div>
        </section>
      )}

      {/* Step 2: Document List with Extracted Data and Bank Entries */}
      {mode === "bulk" && documentsWithEntries.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Step 2 — Configure Bank Entries for Each Document
            </h2>
            <span className="text-xs text-blue-400 font-medium">
              {documentsWithEntries.length} document(s) ready
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {documentsWithEntries.map((docWithEntries, docIdx) => (
              <div
                key={docWithEntries.docId}
                className="border border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Document Header */}
                <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleDocumentCollapse(docIdx)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      {docWithEntries.collapsed ? "▶" : "▼"}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {docWithEntries.docName}
                      </p>
                      {docWithEntries.extractedData && (
                        <p className="text-xs text-gray-500">
                          Extracted: {docWithEntries.extractedData.currency}{" "}
                          {docWithEntries.extractedData.amount} on{" "}
                          {docWithEntries.extractedData.date}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDocument(docIdx)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Remove
                  </button>
                </div>

                {/* Document Content */}
                {!docWithEntries.collapsed && (
                  <div className="p-4 flex flex-col gap-4">
                    {/* Extracted Content Preview */}
                    {docWithEntries.extractedData && (
                      <div className="bg-blue-950/40 border border-blue-900/60 rounded-lg p-3">
                        <p className="text-xs text-blue-300 font-semibold mb-2">
                          💡 AI Extracted Content Preview
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Amount:</span>
                            <p className="text-gray-300 font-medium">
                              {docWithEntries.extractedData.currency}{" "}
                              {docWithEntries.extractedData.amount}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Date:</span>
                            <p className="text-gray-300 font-medium">
                              {docWithEntries.extractedData.date || "N/A"}
                            </p>
                          </div>
                          {docWithEntries.extractedData.payer && (
                            <div>
                              <span className="text-gray-500">Payer:</span>
                              <p className="text-gray-300 font-medium">
                                {docWithEntries.extractedData.payer}
                              </p>
                            </div>
                          )}
                          {docWithEntries.extractedData.myr_amount && (
                            <div>
                              <span className="text-gray-500">MYR Value:</span>
                              <p className="text-green-400 font-medium">
                                MYR {docWithEntries.extractedData.myr_amount}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bank Entries Section */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400 font-semibold">
                          Bank Statement Entries
                        </p>
                        <div className="flex gap-2">
                          <label className="text-blue-400 hover:underline text-xs cursor-pointer">
                            📄 Import CSV
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
                            className="text-blue-400 hover:underline text-xs"
                          >
                            + Add Entry
                          </button>
                        </div>
                      </div>

                      {/* Entry rows */}
                      {docWithEntries.bankEntries.map((entry, entryIdx) => (
                        <div
                          key={entryIdx}
                          className="grid grid-cols-12 gap-2 items-center"
                        >
                          <input
                            type="number"
                            placeholder="Amount (MYR)"
                            value={entry.amount}
                            onChange={(e) =>
                              updateDocumentEntry(
                                docIdx,
                                entryIdx,
                                "amount",
                                e.target.value,
                              )
                            }
                            className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                          />
                          <input
                            type="date"
                            value={entry.date}
                            onChange={(e) =>
                              updateDocumentEntry(
                                docIdx,
                                entryIdx,
                                "date",
                                e.target.value,
                              )
                            }
                            className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                          />
                          <input
                            type="text"
                            placeholder="Payer"
                            value={entry.payer}
                            onChange={(e) =>
                              updateDocumentEntry(
                                docIdx,
                                entryIdx,
                                "payer",
                                e.target.value,
                              )
                            }
                            className="col-span-3 border rounded-lg px-3 py-2 text-sm bg-background"
                          />
                          <input
                            type="text"
                            placeholder="Description"
                            value={entry.description}
                            onChange={(e) =>
                              updateDocumentEntry(
                                docIdx,
                                entryIdx,
                                "description",
                                e.target.value,
                              )
                            }
                            className="col-span-2 border rounded-lg px-3 py-2 text-sm bg-background"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              removeDocumentEntry(docIdx, entryIdx)
                            }
                            disabled={docWithEntries.bankEntries.length === 1}
                            className="col-span-1 text-red-400 text-xs hover:underline disabled:opacity-30"
                          >
                            ✗
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Step 2: Bank entries */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Step 2 — Bank Statement Entries
          </h2>
          <div className="flex gap-3">
            <label className="text-blue-400 hover:underline text-xs cursor-pointer">
              📄 Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleSingleCSVImport}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={addEntry}
              className="text-blue-500 text-xs hover:underline"
            >
              + Add row
            </button>
          </div>
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

      {mode === "single" ? (
        <button
          type="button"
          onClick={handleReconcile}
          disabled={reconciling || uploadAndExtractMutation.isPending}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
        >
          {reconciling ? "Reconciling..." : "Run Reconciliation"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleBulkReconcile}
          disabled={bulkReconciling || documentsWithEntries.length === 0}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
        >
          {bulkReconciling
            ? `Processing ${documentsWithEntries.length} documents in parallel...`
            : `Run Bulk Reconciliation (${documentsWithEntries.length} docs)`}
        </button>
      )}

      {/* Result blocks */}
      {result && decision && (
        <section className="flex flex-col gap-4 border rounded-lg p-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Result</h2>
            <Timeline status="PENDING_ACTION" caseId={null} />
            <div className="flex items-center gap-2">
              <StatusBadge status={decision.final_status} />
              <button
                type="button"
                onClick={() =>
                  downloadResultsCSV(
                    result,
                    `reconciliation-result-${Date.now()}.csv`,
                  )
                }
                className="text-blue-400 hover:underline text-xs flex items-center gap-1"
              >
                📥 Download CSV
              </button>
            </div>
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
                setRecord(rec); // store audit record to show journal etc
              }}
            />
          </div>
        </section>
      )}

      {/* Bulk Results */}
      {mode === "bulk" && bulkResults.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">
              Bulk Reconciliation Results
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {bulkResults.filter((r) => !r.error).length} /{" "}
                {bulkResults.length} successful
              </span>
              <button
                type="button"
                onClick={() =>
                  downloadResultsCSV(
                    bulkResults,
                    `bulk-reconciliation-${Date.now()}.csv`,
                  )
                }
                className="text-blue-400 hover:underline text-xs flex items-center gap-1"
              >
                📥 Download All Results
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {bulkResults.map((result) => {
              const decision = result.result?.agent_decision;
              const hasError = !!result.error;

              return (
                <div
                  key={result.docId}
                  className={`border rounded-lg p-4 ${
                    hasError
                      ? "border-red-700 bg-red-950/20"
                      : "border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {result.docName}
                      </p>
                      {hasError ? (
                        <p className="text-xs text-red-400 mt-1">
                          ✗ Error: {result.error}
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <StatusBadge
                            status={decision?.final_status || "unknown"}
                          />
                          <span className="text-xs text-gray-500">
                            Confidence:{" "}
                            {Math.round((decision?.confidence ?? 0) * 100)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {!hasError && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            // Navigate to history to see details
                            window.location.href = "/history";
                          }}
                          className="text-blue-400 hover:underline text-xs"
                        >
                          View Details →
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Show brief explanation if available */}
                  {!hasError && decision?.explanation && (
                    <div className="mt-3 bg-gray-900 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400">
                        {decision.explanation}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary Statistics */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-green-950/30 border border-green-800/50 rounded-lg p-4">
              <p className="text-xs text-green-400 font-semibold">
                Auto-Approved
              </p>
              <p className="text-2xl font-bold text-green-300 mt-1">
                {
                  bulkResults.filter(
                    (r) => r.result?.agent_decision?.final_status === "matched",
                  ).length
                }
              </p>
            </div>
            <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-4">
              <p className="text-xs text-yellow-400 font-semibold">
                Needs Review
              </p>
              <p className="text-2xl font-bold text-yellow-300 mt-1">
                {
                  bulkResults.filter(
                    (r) =>
                      r.result?.agent_decision?.final_status === "fuzzy" ||
                      r.result?.agent_decision?.final_status === "unmatched",
                  ).length
                }
              </p>
            </div>
            <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-4">
              <p className="text-xs text-red-400 font-semibold">Errors</p>
              <p className="text-2xl font-bold text-red-300 mt-1">
                {bulkResults.filter((r) => r.error).length}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            {bulkResults.filter((r) => r.error).length > 0 && (
              <button
                type="button"
                onClick={handleRetryFailed}
                disabled={bulkReconciling}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                🔄 Retry Failed ({bulkResults.filter((r) => r.error).length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                window.location.href = "/history";
              }}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium"
            >
              View All in History →
            </button>
          </div>
        </section>
      )}

      {/* FULL-SCREEN PREVIEW OVERLAY MODAL */}
      {isModalOpen && previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 select-none backdrop-blur-sm animate-fade-in">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="absolute top-4 right-4 z-[110] bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white px-4 py-2 text-sm font-medium rounded-md shadow-lg transition-colors border border-zinc-700/60"
          >
            Close
          </button>

          {/* Dismissal Side Panels */}
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="absolute top-0 left-0 bottom-0 w-1/4 z-[101] cursor-zoom-out bg-transparent border-0 p-0"
            aria-label="Close preview"
          />
          <div className="relative z-[105] max-w-full max-h-screen p-4 flex items-center justify-center">
            <img
              src={previewUrl}
              alt="Full view proof preview"
              className="max-w-full max-h-[92vh] object-contain rounded border border-zinc-800 shadow-2xl pointer-events-auto"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="absolute top-0 right-0 bottom-0 w-1/4 z-[101] cursor-zoom-out bg-transparent border-0 p-0"
            aria-label="Close preview"
          />
        </div>
      )}
    </div>
  );
}