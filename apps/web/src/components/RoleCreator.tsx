"use client";

import { useState } from "react";
import type { RoleAnalysis, RegulateDimensions } from "@qianmian/shared";
import { analyzePrompt, createCustomRole } from "@/lib/api";
import RadarChart from "./RadarChart";

type FixedDimKey = "creativity" | "talkativeness" | "emotional" | "cooperativeness" | "seriousness";

const REGULATE_DIMENSIONS: Array<{ key: FixedDimKey; label: string; low: string; high: string }> = [
  { key: "creativity", label: "创意/脑洞度", low: "保守", high: "天马行空" },
  { key: "talkativeness", label: "话痨/活跃度", low: "沉默", high: "话痨" },
  { key: "emotional", label: "情感丰富度", low: "冷静", high: "热情" },
  { key: "cooperativeness", label: "配合/亲和度", low: "高冷", high: "亲和" },
  { key: "seriousness", label: "犀利/批判度", low: "温和", high: "犀利" },
];

const TEMPLATE_LABELS: Record<string, string> = {
  emotional: "情感陪伴",
  group: "群聊模拟",
  task: "现实任务",
};

type Props = {
  onCreated?: () => void;
};

export default function RoleCreator({ onCreated }: Props) {
  const [step, setStep] = useState<"prompt" | "analyzing" | "review" | "creating">("prompt");
  const [prompt, setPrompt] = useState("");
  const [analysis, setAnalysis] = useState<RoleAnalysis | null>(null);
  const [edited, setEdited] = useState<RoleAnalysis | null>(null);
  const [regDimensions, setRegDimensions] = useState<RegulateDimensions>({
    creativity: 50, talkativeness: 50, emotional: 50, cooperativeness: 50, seriousness: 50,
    custom: {},
  });
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!prompt.trim()) return setError("请输入角色描述");
    setError(null);
    setStep("analyzing");
    try {
      const res = await analyzePrompt(prompt.trim());
      setAnalysis(res.analysis);
      setEdited(res.analysis);
      setRegDimensions(res.analysis.regulateDimensions);
      setStep("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "分析失败，请重试");
      setStep("prompt");
    }
  }

  async function handleCreate() {
    if (!edited) return;
    setError(null);
    setStep("creating");
    try {
      const payload = { ...edited, regulateDimensions: regDimensions };
      await createCustomRole({ prompt: prompt.trim(), role: payload });
      setStep("prompt");
      setPrompt("");
      setAnalysis(null);
      setEdited(null);
      onCreated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建失败，请重试");
      setStep("review");
    }
  }

  function handleReset() {
    setStep("prompt");
    setPrompt("");
    setAnalysis(null);
    setEdited(null);
    setError(null);
  }

  function updateField<K extends keyof RoleAnalysis>(key: K, value: RoleAnalysis[K]) {
    setEdited((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  // Step: Prompt input
  if (step === "prompt") {
    return (
      <div className="space-y-3">
        <div className="text-xs font-semibold text-purple-800">第一步：描述你想要的角色</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full resize-none rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400"
          placeholder="例如：我想要一个傲娇的猫娘角色，平时嘴硬心软，说话带喵的口癖，性格活泼可爱但偶尔会闹小脾气..."
        />
        <button
          onClick={handleAnalyze}
          className="w-full rounded-xl bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
        >
          分析角色
        </button>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>
    );
  }

  // Step: Analyzing
  if (step === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
        <div className="text-sm text-purple-700 font-medium">AI 正在分析角色...</div>
        <div className="text-xs text-zinc-400">根据你的描述提取性格、情感等维度</div>
      </div>
    );
  }

  // Step: Review & regulate
  if (!edited) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-purple-800">
          {step === "creating" ? "正在创建角色..." : "第二步：确认并调节角色维度"}
        </div>
        <button onClick={handleReset} className="text-xs text-zinc-400 hover:text-zinc-600">
          重新开始
        </button>
      </div>

      {/* 基本信息 */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] text-zinc-500">角色名</span>
          <input
            value={edited.name}
            onChange={(e) => updateField("name", e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500">头像</span>
          <input
            value={edited.avatar}
            onChange={(e) => updateField("avatar", e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] text-zinc-500">模板类型</span>
          <select
            value={edited.templateId}
            onChange={(e) => updateField("templateId", e.target.value as RoleAnalysis["templateId"])}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          >
            {Object.entries(TEMPLATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] text-zinc-500">身份/性格描述</span>
          <textarea
            value={edited.identity}
            onChange={(e) => updateField("identity", e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500">口吻标签（逗号分隔）</span>
          <input
            value={edited.voice.tags.join("，")}
            onChange={(e) => updateField("voice", { ...edited.voice, tags: e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean) })}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500">输出格式</span>
          <input
            value={edited.format}
            onChange={(e) => updateField("format", e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] text-zinc-500">经典台词（每行一句，最多3句）</span>
          <textarea
            value={edited.voice.examples.join("\n")}
            onChange={(e) => updateField("voice", { ...edited.voice, examples: e.target.value.split("\n").filter(Boolean).slice(0, 3) })}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500">应做（每行一条）</span>
          <textarea
            value={edited.dos.join("\n")}
            onChange={(e) => updateField("dos", e.target.value.split("\n").filter(Boolean))}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-zinc-500">禁止（每行一条）</span>
          <textarea
            value={edited.donts.join("\n")}
            onChange={(e) => updateField("donts", e.target.value.split("\n").filter(Boolean))}
            rows={3}
            className="mt-1 w-full resize-none rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
        <label className="block col-span-2">
          <span className="text-[10px] text-zinc-500">技能标签（逗号分隔）</span>
          <input
            value={edited.skills.join("，")}
            onChange={(e) => updateField("skills", e.target.value.split(/[，,]/).map((s) => s.trim()).filter(Boolean))}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-purple-400"
          />
        </label>
      </div>

      {/* 雷达图 + 参数 */}
      <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-4">
        <div className="text-xs font-semibold text-purple-800">第三步：可视化调节个性维度</div>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="shrink-0">
            <RadarChart
              axes={REGULATE_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, low: d.low, high: d.high }))}
              values={(() => { const { custom, ...fixed } = regDimensions; return { ...fixed, ...(custom ?? {}) }; })() as Record<string, number>}
              onChange={(key, val) =>
                setRegDimensions((prev) => ({ ...prev, [key]: val }))
              }
              size={240}
              margin={42}
            />
          </div>

          <div className="flex-1 space-y-3 w-full">
            {REGULATE_DIMENSIONS.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-600">{dim.label}</span>
                  <span className="text-[11px] font-bold text-purple-700">{regDimensions[dim.key]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-zinc-400 w-8 text-right">{dim.low}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={regDimensions[dim.key]}
                    onChange={(e) =>
                      setRegDimensions((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))
                    }
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-purple-200 accent-purple-600"
                  />
                  <span className="text-[9px] text-zinc-400 w-8">{dim.high}</span>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-purple-100">
              <label className="block">
                <span className="text-[10px] text-zinc-500">Temperature</span>
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={edited.parameters.temperature}
                  onChange={(e) => updateField("parameters", { ...edited.parameters, temperature: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-purple-400"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-zinc-500">Max Tokens</span>
                <input
                  type="number"
                  min={16}
                  max={2048}
                  step={1}
                  value={edited.parameters.max_tokens}
                  onChange={(e) => updateField("parameters", { ...edited.parameters, max_tokens: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1 text-xs outline-none focus:border-purple-400"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={step === "creating"}
        className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 transition-colors disabled:opacity-60"
      >
        {step === "creating" ? "创建中..." : "确认创建角色"}
      </button>

      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
