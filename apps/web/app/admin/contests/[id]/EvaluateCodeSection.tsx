"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CodeEditor from "@/components/CodeEditor";
import { DEFAULT_EVALUATE_TEMPLATE } from "@/lib/evaluateTemplates";
import { readApiError, readApiJson } from "@/lib/apiClient";

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
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/cs116.khtn/api/contests/${contestId}/evaluate-code`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluateCode: code }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Failed to save evaluate code"));
        return;
      }
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        evaluateCodeChanged?: boolean;
        requeuedCount?: number;
      }>(res);
      if (data?.ok) {
        const requeuedCount = data.requeuedCount ?? 0;
        setSaved(true);
        if (data.evaluateCodeChanged) {
          setNotice(
            requeuedCount > 0
              ? `Saved. ${requeuedCount} submissions queued for rejudge.`
              : "Saved. No completed submissions to rejudge."
          );
        } else {
          setNotice("Saved. Evaluate code unchanged; no submissions requeued.");
        }
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(data?.error || "Failed to save evaluate code");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] p-6 mt-6">
      <h2 className="text-lg font-bold text-on-surface mb-4">
        Evaluation Code
      </h2>
      {error && (
        <div className="mb-4 rounded-lg bg-error-container/20 px-4 py-2 text-sm text-error">
          {error}
        </div>
      )}

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

      {notice && (
        <p className="mt-3 text-sm font-medium text-on-surface-variant">
          {notice}
        </p>
      )}
    </div>
  );
}
