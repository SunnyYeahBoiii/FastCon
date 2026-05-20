"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { readApiError, readApiJson } from "@/lib/apiClient";

interface GroundTruthSectionProps {
  contestId: string;
  groundTruthPath: string | null;
}

export default function GroundTruthSection({
  contestId,
  groundTruthPath,
}: GroundTruthSectionProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/cs116.khtn/api/contests/${contestId}/ground-truth`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setError(await readApiError(response, "Không thể upload file"));
        return;
      }
      const data = await readApiJson<{ ok?: boolean; error?: string }>(response);
      if (data?.ok) {
        router.refresh();
      } else {
        setError(data?.error || "Không thể upload file");
      }
    } catch (error) {
      console.error("Upload ground truth error:", error);
      setError("Không thể upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6">
      <h2 className="text-lg font-bold text-on-surface mb-4">
        File đáp án
      </h2>
      {error && (
        <div className="mb-4 rounded-lg bg-error-container/20 px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}

      <div className="mb-4">
        {groundTruthPath ? (
          <div className="flex items-center gap-3 p-4 bg-surface-container-highest rounded-lg">
            <span className="material-symbols-outlined text-primary">check_circle</span>
            <div>
              <div className="text-sm font-medium text-on-surface">Đáp án đã được tải lên</div>
              <div className="text-xs text-on-surface-variant">{groundTruthPath}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-surface-container-highest rounded-lg">
            <span className="material-symbols-outlined text-on-surface-variant">warning</span>
            <div className="text-sm text-on-surface-variant">Chưa có đáp án</div>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        accept=".pkl"
        onChange={handleUpload}
        className="hidden"
      />

      <button
        onClick={handleButtonClick}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-highest rounded-lg text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {uploading ? "Đang tải..." : groundTruthPath ? "Thay đổi file" : "Tải file đáp án"}
      </button>
    </div>
  );
}
