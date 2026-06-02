import React, { useRef, useState } from "react";
import api, { BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Paperclip, FileText, Image as ImageIcon, X, CircleNotch, Download } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Upload one or more attachments and keep their refs in component state.
 * `value` = current array of file refs.
 * Calls `onChange(refs)` whenever files are added/removed.
 */
export function AttachmentUploader({ value = [], onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const pick = () => inputRef.current?.click();

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await api.post("/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploaded.push(r.data);
      }
      onChange([...(value || []), ...uploaded]);
      toast.success(`${uploaded.length} file(s) uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = (id) => onChange(value.filter((f) => f.id !== id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="overline">Attachments · {value.length}</div>
        <Button
          data-testid="attach-pick-btn"
          size="sm"
          type="button"
          variant="outline"
          className="border-[#E2DDD7] text-[#1C3F39] hover:bg-[#F3EFE9] rounded-full h-8"
          onClick={pick}
          disabled={uploading}
        >
          {uploading ? <><CircleNotch size={14} className="mr-1.5 animate-spin" /> Uploading…</> : <><Paperclip size={14} className="mr-1.5" /> Attach files</>}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv"
        onChange={onPick}
        className="hidden"
        data-testid="attach-input"
      />
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {value.map((f) => (
            <FilePill key={f.id} f={f} onRemove={() => remove(f.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilePill({ f, onRemove }) {
  const isImage = f.content_type?.startsWith("image/");
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl border border-[#E2DDD7] bg-white">
      <div className="w-8 h-8 rounded-lg bg-[#F3EFE9] flex items-center justify-center shrink-0">
        <Icon size={16} weight="duotone" color="#1C3F39" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{f.original_filename}</div>
        <div className="text-[10px] text-[#5C6661] font-mono">{(f.size / 1024).toFixed(1)} KB</div>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-[#5C6661] hover:text-[#9B2226]" data-testid={`attach-remove-${f.id}`}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Display attachments attached to a record (read-only with download).
 */
export function AttachmentList({ files = [] }) {
  if (!files || files.length === 0) return null;
  const download = async (f) => {
    try {
      const token = localStorage.getItem("ml_token");
      const r = await fetch(`${BACKEND_URL}/api/files/${f.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.original_filename || "file";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed");
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {files.map((f) => {
        const isImage = f.content_type?.startsWith("image/");
        const Icon = isImage ? ImageIcon : FileText;
        return (
          <button
            key={f.id}
            type="button"
            data-testid={`attachment-${f.id}`}
            onClick={() => download(f)}
            className="flex items-center gap-2 p-2 rounded-xl border border-[#E2DDD7] bg-white hover:bg-[#F3EFE9] text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#F3EFE9] flex items-center justify-center shrink-0">
              <Icon size={16} weight="duotone" color="#1C3F39" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{f.original_filename}</div>
              <div className="text-[10px] text-[#5C6661] font-mono">{(f.size / 1024).toFixed(1)} KB</div>
            </div>
            <Download size={14} className="text-[#1C3F39] shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
