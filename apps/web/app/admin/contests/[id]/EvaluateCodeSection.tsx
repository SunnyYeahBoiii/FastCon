"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CodeEditor from "@/components/CodeEditor";
import { DEFAULT_EVALUATE_TEMPLATE } from "@/lib/evaluateTemplates";

interface EvaluateCodeSectionProps {
  contestId: string;
  initialEvaluateCode: string | null;
}

export default function EvaluateCodeSection({
  contestId,
  initialEvaluateCode,
}: EvaluateCodeSectionProps) {
  const router = useRouter();
  const [code, setCode] = useState(
    initialEvaluateCode || DEFAULT_EVALUATE_TEMPLATE
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/contests/${contestId}/evaluate-code`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluateCode: code }),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert(data.error || "Failed to save evaluate code");
      }
    } catch (e) {
      alert("Network error: " + e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6 mt-6">
      <h2 className="text-lg font-bold text-on-surface mb-4">
        Evaluation Code
      </h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-on-surface-variant mb-2">
          Python Evaluate Function
        </label>
        <CodeEditor value={code} onChange={setCode} height="400px" />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2.5 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save Evaluate Code"}
      </button>
    </div>
  );
}
