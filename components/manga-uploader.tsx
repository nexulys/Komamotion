"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { Check, Loader2, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MangaPanel {
  id: string;
  /** Storage path in the private manga-sources bucket — what the server actually uses. */
  path: string;
  /** Short-lived signed URL for on-screen preview only. */
  url: string;
  name: string;
}

interface MangaUploaderProps {
  panels: MangaPanel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpload: (files: File[]) => void | Promise<void>;
  onRemove?: (id: string) => void;
  isUploading?: boolean;
  /** Batch mode: multiple panels can be checked at once for a shared render. */
  multiSelect?: boolean;
  selectedIds?: string[];
}

export function MangaUploader({
  panels,
  selectedId,
  onSelect,
  onUpload,
  onRemove,
  isUploading = false,
  multiSelect = false,
  selectedIds = [],
}: MangaUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length) onUpload(acceptedFiles);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [], "image/jpeg": [], "image/webp": [] },
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-secondary/10 px-6 py-10 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5"
        )}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <Loader2 className="size-7 animate-spin text-primary" />
        ) : (
          <UploadCloud className="size-7 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {isDragActive ? "Drop your manga panels" : "Drag & drop manga panels here"}
        </p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WEBP — black & white or color, single pages or full chapters
        </p>
      </div>

      {panels.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {panels.map((panel) => {
            const selected = multiSelect ? selectedIds.includes(panel.id) : panel.id === selectedId;
            return (
              <motion.button
                type="button"
                key={panel.id}
                onClick={() => onSelect(panel.id)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-secondary/20 transition-colors",
                  selected ? "border-primary" : "border-transparent hover:border-border"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={panel.url}
                  alt={panel.name}
                  className="size-full object-cover"
                />
                {selected && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full brand-gradient-bg text-white">
                    <Check className="size-3" />
                  </span>
                )}
                {onRemove && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(panel.id);
                    }}
                    className="absolute top-1.5 left-1.5 hidden size-5 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                  >
                    <Trash2 className="size-3" />
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
