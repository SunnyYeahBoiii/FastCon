"use client";

import { useState, useRef } from "react";
import { Upload } from "lucide-react";

interface GroundTruthSectionProps {
  contestId: string;
  contestCode: string;
  groundTruthPath: string | null;
  onUploadSuccess: () => void;
}

export default function GroundTruthSection({
  contestId,
  contestCode,
  groundTruthPath,
  onUploadSuccess,
}: GroundTruthSectionProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/contests/${contestId}/ground-truth`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.ok) {
        onUploadSuccess();
      } else {
        alert(data.error || "Không thể upload file");
      }
    } catch (error) {
      console.error("Upload ground truth error:", error);
      alert("Không thể upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6">
      <h2 className="text-lg font-bold text-on-surface mb-4">
        <span className="material-symbols-outlined inline-block mr-2" style={{ fontVariationSettings: "'FILL' 1" }}>
          file_check
        </span>
        File đáp án
      </h2>

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