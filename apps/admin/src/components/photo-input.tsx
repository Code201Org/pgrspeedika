"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { Button, Field, Input } from "@pgrs/ui";
import { api } from "@/lib/api";

const MAX_SIDE = 1000;

/**
 * Shrink a phone-camera photo in the browser (max 1000px, WebP with a JPEG
 * fallback) so uploads stay well under the 2 MB API limit even on slow data.
 */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.82);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}

/** Image URL field with a phone-camera upload button and a live preview. */
export function PhotoInput({
  value,
  onChange,
  label = "Photo",
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await compressImage(file);
      const res = await api.api.uploads.image.$post({ json: { data } });
      const body = (await res.json()) as { ok: boolean; data?: { url: string }; message?: string };
      if (!body.ok || !body.data) throw new Error(body.message ?? "Upload failed");
      return body.data.url;
    },
    onSuccess: (url) => {
      setPreview(url);
      onChange(url);
      toast.success("Photo uploaded");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Field label={label} hint={hint ?? "Paste a URL or take/upload a photo"}>
      <div className="flex items-start gap-2">
        {(preview ?? value) ? (
          <div className="relative shrink-0">
            <img
              src={preview ?? value}
              alt=""
              className="h-14 w-14 rounded-xl border border-line object-cover"
            />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                setPreview(null);
                onChange("");
              }}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-white text-danger shadow-card"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            placeholder="https://… or upload below"
            value={value}
            onChange={(e) => {
              setPreview(null);
              onChange(e.target.value);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              loading={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-4 w-4" aria-hidden />
              {upload.isPending ? "Uploading…" : "Upload / take photo"}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </Field>
  );
}
