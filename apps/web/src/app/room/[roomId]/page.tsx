"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CustomDimensionMeta, InterruptType, RegulateDimensions, RoleCard, RoomTemplateId } from "@qianmian/shared";
import { getSocket } from "@/lib/socket";
import { useRoomStore, type ChatMessage } from "@/lib/store";
import RadarChart from "@/components/RadarChart";

const INTERRUPT_LABEL: Record<InterruptType, string> = {
  ask: "普通插话",
  correct: "纠错/反驳",
  add_constraint: "新增约束",
  add_setting: "新增设定",
  change_goal: "改目标",
  mute_roles: "禁言/解除",
  regulate_roles: "情感调节",
  stop: "停止",
};

type InteractionCategory = "chat" | "modify" | "mute" | "regulate" | "stop";

const CATEGORY_LABELS: Record<InteractionCategory, { label: string; icon: string }> = {
  chat: { label: "插话", icon: "💬" },
  modify: { label: "对话修改", icon: "🛠️" },
  mute: { label: "禁言", icon: "🙊" },
  regulate: { label: "调节", icon: "🎚️" },
  stop: { label: "停止", icon: "🛑" },
};

const MODIFY_SUB_TYPES: Array<{ label: string; type: InterruptType; icon: string }> = [
  { label: "提问", type: "ask", icon: "🙋" },
  { label: "纠错", type: "correct", icon: "❌" },
  { label: "改目标", type: "change_goal", icon: "🎯" },
  { label: "加设定", type: "add_setting", icon: "🎭" },
];

type FixedDimKey = "creativity" | "talkativeness" | "emotional" | "cooperativeness" | "seriousness";

const REGULATE_DIMENSIONS: Array<{ key: FixedDimKey; label: string; low: string; high: string }> = [
  { key: "creativity", label: "创意/脑洞度", low: "保守", high: "天马行空" },
  { key: "talkativeness", label: "话痨/活跃度", low: "沉默", high: "话痨" },
  { key: "emotional", label: "情感丰富度", low: "冷静", high: "热情" },
  { key: "cooperativeness", label: "配合/亲和度", low: "高冷", high: "亲和" },
  { key: "seriousness", label: "犀利/批判度", low: "温和", high: "犀利" },
];

const DEFAULT_REGULATE: RegulateDimensions = {
  creativity: 50,
  talkativeness: 50,
  emotional: 50,
  cooperativeness: 50,
  seriousness: 50,
  custom: {},
};

type RoomStateEvent = {
  roomId: string;
  running: boolean;
  mutedRoleIds?: string[];
  turnIndex: number;
  name?: string;
  templateId?: RoomTemplateId;
};

type RoomMessagesEvent = {
  roomId: string;
  messages: ChatMessage[];
};

type GenericAck = { ok: true } | { ok: false; error?: unknown };
type JoinRoomAck =
  | { 
      ok: true; 
      room: { 
        config?: { name?: string; templateId?: RoomTemplateId }; 
        running?: boolean; 
        mutedRoleIds?: string[];
        turnIndex?: number; 
        messages?: ChatMessage[];
        roles?: RoleCard[];
      } 
    }
  | { ok: false; error?: unknown };

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = decodeURIComponent(params.roomId);

  const { roomName, running, turnIndex, messages, pendingById, setRoom, setRunning, setMessages, startMessage, appendDelta, finalizeMessage } =
    useRoomStore();

  const [content, setContent] = useState("");
  const [activeCategory, setActiveCategory] = useState<InteractionCategory>("chat");
  const [interruptType, setInterruptType] = useState<InterruptType>("ask");
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [mutedRoleIds, setMutedRoleIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<RoleCard[]>([]);
  const [selectedRoleIdsForAction, setSelectedRoleIdsForAction] = useState<string[]>([]);
  const [showMentionPanel, setShowMentionPanel] = useState(false);
  const [templateId, setTemplateId] = useState<RoomTemplateId>("group");
  const [regulateRoleId, setRegulateRoleId] = useState<string | null>(null);
  const [regulateValues, setRegulateValues] = useState<RegulateDimensions>({ ...DEFAULT_REGULATE });
  const [savedRegulations, setSavedRegulations] = useState<Record<string, RegulateDimensions>>({});
  const [customDimsMeta, setCustomDimsMeta] = useState<CustomDimensionMeta[]>([]);
  const [showAddDim, setShowAddDim] = useState(false);
  const [newDim, setNewDim] = useState<CustomDimensionMeta>({ key: "", label: "", low: "低", high: "高" });
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    // 监听分类变化，自动设置默认子类型
    if (activeCategory === "chat") setInterruptType("ask");
    else if (activeCategory === "mute") setInterruptType("mute_roles");
    else if (activeCategory === "regulate") setInterruptType("regulate_roles");
    else if (activeCategory === "stop") setInterruptType("stop");
    else if (activeCategory === "modify") {
      // 保持之前的子类型，或者默认设为 ask (提问)
      if (!MODIFY_SUB_TYPES.some(t => t.type === interruptType)) {
        setInterruptType("ask");
      }
    }
  }, [activeCategory]);

  useEffect(() => {
    setError(null);

    function onConnect() {
      setConnected(true);
    }
    function onDisconnect() {
      setConnected(false);
    }

    function onRoomState(s: unknown) {
      const e = s as Partial<RoomStateEvent> | null;
      if (!e?.roomId || e.roomId !== roomId) return;
      setRoom({ roomId, roomName: e.name ?? roomName ?? "" });
      setRunning(!!e.running, e.turnIndex);
      if (e.mutedRoleIds !== undefined) setMutedRoleIds(e.mutedRoleIds);
      if (e.templateId) setTemplateId(e.templateId);
    }

    function onRoomMessages(payload: unknown) {
      const e = payload as Partial<RoomMessagesEvent> | null;
      if (e?.roomId !== roomId) return;
      setMessages((e.messages ?? []) as ChatMessage[]);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageStart(m: ChatMessage) {
      if (m.roomId !== roomId) return;
      startMessage(m);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageDelta(p: unknown) {
      const e = p as Partial<{ roomId: string; messageId: string; delta: string }> | null;
      if (e?.roomId !== roomId) return;
      if (!e.messageId) return;
      appendDelta(e.messageId, e.delta ?? "");
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageDone(m: ChatMessage) {
      if (m.roomId !== roomId) return;
      finalizeMessage(m);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onError(p: unknown) {
      const e = p as Partial<{ roomId: string; message: string }> | null;
      if (e?.roomId && e.roomId !== roomId) return;
      setError(e?.message ?? "发生错误");
    }

    socket.on("room.state", onRoomState);
    socket.on("room.messages", onRoomMessages);
    socket.on("message.start", onMessageStart);
    socket.on("message.delta", onMessageDelta);
    socket.on("message.done", onMessageDone);
    socket.on("error", onError);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    socket.emit("room.join", { roomId }, (ack: unknown) => {
      const res = (ack ?? { ok: false }) as JoinRoomAck;
      if (!res?.ok) setError(typeof res.error === "string" ? res.error : "加入房间失败");
      else {
        setRoom({ roomId, roomName: res.room?.config?.name ?? "" });
        setRunning(!!res.room?.running, res.room?.turnIndex ?? 0);
        setMessages((res.room?.messages ?? []) as ChatMessage[]);
        if (res.room?.mutedRoleIds !== undefined) setMutedRoleIds(res.room.mutedRoleIds);
        if (res.room?.config?.templateId) setTemplateId(res.room.config.templateId);
        if (res.room?.roles) setRoles(res.room.roles);
        queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
      }
    });

    return () => {
      socket.off("room.state", onRoomState);
      socket.off("room.messages", onRoomMessages);
      socket.off("message.start", onMessageStart);
      socket.off("message.delta", onMessageDelta);
      socket.off("message.done", onMessageDone);
      socket.off("error", onError);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  async function sendUserMessage() {
    setError(null);
    const text = content.trim();

    if (interruptType === "mute_roles") {
      if (selectedRoleIdsForAction.length === 0) return setError("请先选择要禁言/解除的角色");
      const allMuted = selectedRoleIdsForAction.every(id => mutedRoleIds.includes(id));
      socket.emit("room.mute", { roomId, roleIds: selectedRoleIdsForAction, muted: !allMuted });
      setSelectedRoleIdsForAction([]);
      setContent("");
      return;
    }

    if (interruptType === "regulate_roles") {
      if (!regulateRoleId) return setError("请先选择要调节的角色");
      const newSaved = { ...savedRegulations, [regulateRoleId]: { ...regulateValues } };
      setSavedRegulations(newSaved);
      socket.emit("room.regulate", { roomId, roleId: regulateRoleId, dimensions: regulateValues });
      if (text) {
        socket.emit("user.message", { roomId, content: text, interruptType, mentionRoleIds: [regulateRoleId] }, (ack: unknown) => {
          const res = (ack ?? { ok: false }) as GenericAck;
          if (!res?.ok) setError(typeof res.error === "string" ? res.error : "发送失败");
        });
      }
      setContent("");
      return;
    }

    if (!text) return;

    setContent("");
    const mentionRoleIds = selectedRoleIdsForAction;
    setSelectedRoleIdsForAction([]); 
    setShowMentionPanel(false);

    socket.emit("user.message", { roomId, content: text, interruptType, mentionRoleIds }, (ack: unknown) => {
      const res = (ack ?? { ok: false }) as GenericAck;
      if (!res?.ok) setError(typeof res.error === "string" ? res.error : "发送失败");
    });

    if (interruptType === "stop") {
      socket.emit("room.stop", { roomId });
    }
  }

  async function sendAndStart() {
    await sendUserMessage();
    if (interruptType !== "stop" && interruptType !== "mute_roles" && interruptType !== "regulate_roles" && !running) startAuto();
  }

  function startAuto() {
    setError(null);
    socket.emit("room.start", { roomId }, (ack: unknown) => {
      const res = (ack ?? { ok: false }) as GenericAck;
      if (!res?.ok) setError(typeof res.error === "string" ? res.error : "启动失败");
    });
  }

  function stopAuto() {
    setError(null);
    socket.emit("room.stop", { roomId }, (ack: unknown) => {
      const res = (ack ?? { ok: false }) as GenericAck;
      if (!res?.ok) setError(typeof res.error === "string" ? res.error : "停止失败");
    });
  }

  function toggleRoleSelection(roleId: string) {
    setSelectedRoleIdsForAction((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  function onTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    
    // 检查最后输入的字符是否为 @
    const lastChar = val.slice(-1);
    if (lastChar === "@") {
      setShowMentionPanel(true);
    } else if (showMentionPanel && !val.includes("@")) {
      setShowMentionPanel(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={() => router.push("/")}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              ← 返回
            </button>
            <h1 className="mt-1 truncate text-xl font-semibold">{roomName || "房间"}</h1>
            <div className="mt-1 text-xs text-zinc-600">
              状态：{running ? "自动对话中" : "已暂停"} · 回合：{turnIndex} · 连接：
              <span className={connected ? "text-emerald-700" : "text-red-700"}>{connected ? "已连接" : "已断开"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={startAuto}
              disabled={running}
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              开始
            </button>
            <button
              onClick={stopAuto}
              disabled={!running}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            >
              暂停
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          className="flex-1 overflow-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200"
        >
          {messages.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              还没有消息。点击右上角“开始”，或先在下方插话。
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex gap-3 ${m.speakerType === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`mt-0.5 h-8 w-8 shrink-0 rounded-full text-center text-xs leading-8 shadow-sm ${
                    m.speakerType === "user" 
                      ? "bg-zinc-900 text-white" 
                      : m.speakerType === "narrator" || m.speakerType === "host"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-zinc-100 text-zinc-700"
                  }`}>
                    {m.speakerName.slice(0, 1)}
                  </div>
                  <div className={`min-w-0 flex-1 ${m.speakerType === "user" ? "text-right" : ""}`}>
                    <div className={`flex items-center gap-2 ${m.speakerType === "user" ? "flex-row-reverse" : ""}`}>
                      <div className="text-sm font-semibold">{m.speakerName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {new Date(m.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {pendingById[m.id] ? (
                        <div className="animate-pulse text-[11px] font-medium text-amber-600">思考中…</div>
                      ) : null}
                    </div>
                    <div className={`mt-1 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm leading-6 shadow-sm ${
                      m.speakerType === "user"
                        ? "bg-zinc-900 text-white rounded-tr-none"
                        : m.speakerType === "narrator" || m.speakerType === "host"
                          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-100 rounded-tl-none italic"
                          : "bg-zinc-100 text-zinc-900 rounded-tl-none"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="mb-4 space-y-3">
            {/* 顶级分类选择 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 pb-3">
              {(Object.entries(CATEGORY_LABELS) as [InteractionCategory, { label: string; icon: string }][]).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => {
                    setActiveCategory(key);
                    setSelectedRoleIdsForAction([]);
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    activeCategory === key
                      ? "bg-zinc-900 text-white shadow-md scale-105"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  <span>{value.icon}</span>
                  <span>{value.label}</span>
                </button>
              ))}
            </div>

            {/* 对话修改子选项 */}
            {activeCategory === "modify" && (
              <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                  选择修改方式:
                </span>
                {MODIFY_SUB_TYPES.map((q) => (
                  <button
                    key={q.type}
                    onClick={() => setInterruptType(q.type)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      interruptType === q.type
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    <span>{q.icon}</span>
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 禁言/提到的角色选择面板 */}
            {(activeCategory === "mute" || showMentionPanel) && roles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                  {activeCategory === "mute" ? "选择禁言对象:" : "@ 指定角色:"}
                </span>
                {roles.map((r) => {
                  const isMuted = mutedRoleIds.includes(r.id);
                  const isSelected = selectedRoleIdsForAction.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRoleSelection(r.id)}
                      className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                        isSelected
                          ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                          : isMuted
                            ? "bg-red-50 text-red-400 opacity-60"
                            : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      {r.avatar} {r.name} {isMuted && "(已禁言)"}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 情感调节面板 */}
            {activeCategory === "regulate" && roles.length > 0 && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                    选择角色:
                  </span>
                  {roles.map((r) => {
                    const isSelected = regulateRoleId === r.id;
                    const hasSaved = savedRegulations[r.id] !== undefined;
                    return (
                      <button
                        key={r.id}
                        onClick={() => {
                          setRegulateRoleId(r.id);
                          setRegulateValues(savedRegulations[r.id] ?? { ...DEFAULT_REGULATE });
                        }}
                        className={`rounded-full px-2 py-1 text-[11px] font-medium transition-all ${
                          isSelected
                            ? "bg-purple-100 text-purple-700 ring-1 ring-purple-300"
                            : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
                        }`}
                      >
                        {r.avatar} {r.name} {hasSaved && "✓"}
                      </button>
                    );
                  })}
                </div>

                {regulateRoleId && (() => {
                  const allAxes = [
                    ...REGULATE_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, low: d.low, high: d.high })),
                    ...customDimsMeta.map((d) => ({ key: d.key, label: d.label, low: d.low, high: d.high })),
                  ];
                  const { custom: _custom, ...fixedVals } = regulateValues;
                  const allValues: Record<string, number> = { ...fixedVals, ...(regulateValues.custom ?? {}) };

                  return (
                  <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-4">
                    <div className="text-xs font-semibold text-purple-800">
                      调节「{roles.find((r) => r.id === regulateRoleId)?.name ?? ""}」的个性维度
                    </div>

                    {/* 雷达图 */}
                    <div className="flex justify-center">
                      <RadarChart
                        axes={allAxes}
                        values={allValues}
                        onChange={(key, val) => {
                          const isFixed = REGULATE_DIMENSIONS.some((d) => d.key === key);
                          if (isFixed) {
                            setRegulateValues((prev) => ({ ...prev, [key]: val }));
                          } else {
                            setRegulateValues((prev) => ({
                              ...prev,
                              custom: { ...(prev.custom ?? {}), [key]: val },
                            }));
                          }
                        }}
                      />
                    </div>

                    {/* 分隔线 */}
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-purple-100" />
                      <span className="text-[10px] text-zinc-400">精确调节</span>
                      <div className="h-px flex-1 bg-purple-100" />
                    </div>

                    {/* 固定维度滑块 */}
                    {REGULATE_DIMENSIONS.map((dim) => (
                      <div key={dim.key} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-600">{dim.label}</span>
                          <span className="text-xs font-bold text-purple-700 tabular-nums">
                            {regulateValues[dim.key]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 w-10 text-right shrink-0">{dim.low}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={regulateValues[dim.key]}
                            onChange={(e) =>
                              setRegulateValues((prev) => ({ ...prev, [dim.key]: Number(e.target.value) }))
                            }
                            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-purple-200 accent-purple-600 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:shadow-sm"
                          />
                          <span className="text-[10px] text-zinc-400 w-10 shrink-0">{dim.high}</span>
                        </div>
                      </div>
                    ))}

                    {/* 自定义维度滑块 */}
                    {customDimsMeta.length > 0 && (
                      <div className="border-t border-purple-100 pt-3">
                        <div className="text-[10px] font-semibold text-purple-600 mb-2">自定义维度</div>
                        {customDimsMeta.map((dim) => (
                          <div key={dim.key} className="space-y-1 mb-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-purple-600">{dim.label}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-purple-700 tabular-nums">
                                  {regulateValues.custom?.[dim.key] ?? 50}
                                </span>
                                <button
                                  onClick={() => {
                                    setCustomDimsMeta((prev) => prev.filter((d) => d.key !== dim.key));
                                    setRegulateValues((prev) => {
                                      const c = { ...(prev.custom ?? {}) };
                                      delete c[dim.key];
                                      return { ...prev, custom: c };
                                    });
                                  }}
                                  className="text-[10px] text-red-400 hover:text-red-600 ml-1"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-400 w-10 text-right shrink-0">{dim.low}</span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={regulateValues.custom?.[dim.key] ?? 50}
                                onChange={(e) =>
                                  setRegulateValues((prev) => ({
                                    ...prev,
                                    custom: { ...(prev.custom ?? {}), [dim.key]: Number(e.target.value) },
                                  }))
                                }
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-purple-200 accent-purple-600 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-600 [&::-webkit-slider-thumb]:shadow-sm"
                              />
                              <span className="text-[10px] text-zinc-400 w-10 shrink-0">{dim.high}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 新增自定义维度 */}
                    {!showAddDim ? (
                      <button
                        onClick={() => setShowAddDim(true)}
                        className="w-full rounded-lg border border-dashed border-purple-300 py-1.5 text-[11px] text-purple-500 hover:bg-purple-50 transition-colors"
                      >
                        + 新增维度
                      </button>
                    ) : (
                      <div className="rounded-lg border border-purple-200 bg-white p-3 space-y-2">
                        <div className="text-[10px] font-semibold text-purple-600">新增自定义维度</div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={newDim.label}
                            onChange={(e) => {
                              const label = e.target.value;
                              const key = label.replace(/[^a-zA-Z0-9一-鿿]/g, "_").toLowerCase() || "custom";
                              setNewDim({ ...newDim, label, key });
                            }}
                            placeholder="维度名称（如：耐心度）"
                            className="col-span-2 rounded-md border border-zinc-200 px-2 py-1 text-[11px] outline-none focus:border-purple-400"
                          />
                          <input
                            value={newDim.low}
                            onChange={(e) => setNewDim({ ...newDim, low: e.target.value })}
                            placeholder="低端标签"
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] outline-none focus:border-purple-400"
                          />
                          <input
                            value={newDim.high}
                            onChange={(e) => setNewDim({ ...newDim, high: e.target.value })}
                            placeholder="高端标签"
                            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] outline-none focus:border-purple-400"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!newDim.label.trim()) return;
                              setCustomDimsMeta((prev) => [...prev, { ...newDim, key: newDim.key || `dim_${Date.now().toString(36)}` }]);
                              setRegulateValues((prev) => ({
                                ...prev,
                                custom: { ...(prev.custom ?? {}), [newDim.key || `dim_${Date.now().toString(36)}`]: 50 },
                              }));
                              setNewDim({ key: "", label: "", low: "低", high: "高" });
                              setShowAddDim(false);
                            }}
                            className="flex-1 rounded-md bg-purple-600 py-1 text-[11px] font-medium text-white hover:bg-purple-700"
                          >
                            添加
                          </button>
                          <button
                            onClick={() => { setShowAddDim(false); setNewDim({ key: "", label: "", low: "低", high: "高" }); }}
                            className="rounded-md border border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        const newSaved = { ...savedRegulations, [regulateRoleId]: { ...regulateValues } };
                        setSavedRegulations(newSaved);
                        socket.emit("room.regulate", { roomId, roleId: regulateRoleId, dimensions: regulateValues });
                      }}
                      className="w-full rounded-xl bg-purple-600 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
                    >
                      应用调节
                    </button>
                  </div>
                  );
                })()}
              </div>
            )}

          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <div className="text-sm font-medium text-zinc-700">
                {activeCategory === "chat" ? "你的话 (插话)" :
                 activeCategory === "modify" ? `修改建议 (${INTERRUPT_LABEL[interruptType]})` :
                 activeCategory === "mute" ? "禁言备注 (可选)" :
                 activeCategory === "regulate" ? "调节备注 (可选)" : "停止理由 (可选)"}
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={onTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      return;
                    }
                    e.preventDefault();
                    void sendAndStart();
                  }
                }}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-zinc-400"
                placeholder={
                  activeCategory === "mute"
                    ? "选中角色后，点击发送执行禁言/解除"
                    : activeCategory === "regulate"
                    ? "调节角色个性后点击「应用调节」，或输入备注后发送"
                    : activeCategory === "stop"
                    ? "输入停止理由，点击发送终止对话"
                    : "Enter 发送；Ctrl/⌘ + Enter 换行；输入 @ 选择角色"
                }
              />
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => void sendUserMessage()}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                仅发送
              </button>
              <button
                onClick={() => void sendAndStart()}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                发送并开始
              </button>
            </div>
          </div>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

