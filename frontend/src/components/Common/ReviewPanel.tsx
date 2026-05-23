import { useState } from "react";
import { FilesService } from "../../client";

interface Props {
  documentId: string;
  currentStatus: string | null | undefined;
  currentNote: string | null | undefined;
  finalStatus: "matched" | "fuzzy" | "unmatched" | string;
  onSaved?: () => void;
}

const STATUS_OPTIONS = [
  {
    value: "approved",
    label: "✓ Approve",
    description: "Accept this match as correct despite the discrepancy",
    className:
      "border-green-700 bg-green-950 text-green-300 hover:bg-green-900",
  },
  {
    value: "flagged",
    label: "⚠ Flag for Review",
    description: "Mark this for a human to investigate further",
    className:
      "border-yellow-700 bg-yellow-950 text-yellow-300 hover:bg-yellow-900",
  },
  {
    value: "exception",
    label: "📋 Mark as Exception",
    description:
      "Known issue — split payment, refund, fee difference, wrong account",
    className: "border-blue-700 bg-blue-950 text-blue-300 hover:bg-blue-900",
  },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  approved: { label: "✓ Approved", className: "text-green-400" },
  flagged: { label: "⚠ Flagged for Review", className: "text-yellow-400" },
  exception: { label: "📋 Marked as Exception", className: "text-blue-400" },
};

export function ReviewPanel({
  documentId,
  currentStatus,
  currentNote,
  finalStatus,
  onSaved,
}: Props) {
  const [selected, setSelected] = useState<string>(currentStatus ?? "");
  const [note, setNote] = useState<string>(currentNote ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentStatus);

  // Don't show for clean matches unless already reviewed
  if (finalStatus === "matched" && !currentStatus) return null;

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await FilesService.reviewDocument({
        documentId,
        requestBody: { status: selected, note: note || undefined },
      });
      setSaved(true);
      onSaved?.();
    } catch {
      // handle silently — user can retry
    } finally {
      setSaving(false);
    }
  };

  if (saved && currentStatus) {
    const meta = STATUS_LABELS[currentStatus];
    return (
      <div className="flex flex-col gap-2 border border-gray-700 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-medium ${meta?.className ?? "text-gray-300"}`}
          >
            {meta?.label ?? currentStatus}
          </span>
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="text-gray-500 text-xs hover:underline"
          >
            Edit
          </button>
        </div>
        {currentNote && (
          <p className="text-xs text-gray-400 italic">"{currentNote}"</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-gray-700 rounded-lg px-4 py-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
        {finalStatus === "fuzzy"
          ? "This match needs review — what would you like to do?"
          : "No match found — how would you like to handle this?"}
      </p>

      <div className="flex flex-col gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-all ${
              selected === opt.value
                ? opt.className
                : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600"
            }`}
          >
            <span className="text-sm font-medium">{opt.label}</span>
            <span className="text-xs opacity-70 mt-0.5">{opt.description}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              selected === "approved"
                ? "Optional: reason for approval (e.g. bank fee accounted for)"
                : selected === "flagged"
                  ? "Optional: describe what needs investigation"
                  : "Optional: describe the exception (e.g. split payment across 2 transactions)"
            }
            rows={2}
            className="w-full border border-gray-700 rounded-lg px-3 py-2 text-sm bg-background text-gray-300 placeholder:text-gray-600 resize-none"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 self-start"
          >
            {saving ? "Saving..." : "Save Decision"}
          </button>
        </div>
      )}
    </div>
  );
}
