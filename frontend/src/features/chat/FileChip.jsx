import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  X,
} from "lucide-react";
import { formatBytes } from "../../lib/format";

function iconFor(mime = "", name = "") {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.includes("zip") || ext === "zip") return FileArchive;
  if (mime.includes("spreadsheet") || mime === "text/csv" || ["xlsx", "csv"].includes(ext)) {
    return FileSpreadsheet;
  }
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("word")) {
    return FileText;
  }
  return FileIcon;
}

export default function FileChip({ attachment, mine, onRemove }) {
  const Icon = iconFor(attachment.mime, attachment.name);
  const ext = (attachment.name ?? "").split(".").pop()?.toUpperCase() ?? "";
  const inner = (
    <>
      <span
        className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${mine ? "bg-primary-content/15" : "bg-base-300"}`}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{attachment.name ?? "File"}</span>
        <span className="block text-[11px] opacity-70">
          {[ext, formatBytes(attachment.size)].filter(Boolean).join(" · ")}
        </span>
      </span>
    </>
  );

  if (onRemove) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-2 py-1.5 max-w-xs">
        {inner}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle"
          onClick={onRemove}
          aria-label="Remove file"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name ?? true}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 min-w-[11rem] max-w-xs ${mine ? "bg-primary-content/10 hover:bg-primary-content/20" : "bg-base-300/60 hover:bg-base-300"}`}
    >
      {inner}
      <Download className="size-4 opacity-70 shrink-0" aria-hidden="true" />
    </a>
  );
}
