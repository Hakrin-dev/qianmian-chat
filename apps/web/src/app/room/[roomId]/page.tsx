"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { InterruptType } from "@qianmian/shared";
import { getSocket } from "@/lib/socket";
import { useRoomStore, type ChatMessage } from "@/lib/store";

const INTERRUPT_LABEL: Record<InterruptType, string> = {
  ask: "提问",
  correct: "纠错/反驳",
  add_constraint: "新增约束",
  add_setting: "新增设定",
  change_goal: "改目标",
  stop: "停止",
};

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = decodeURIComponent(params.roomId);

  const { roomName, running, turnIndex, messages, setRoom, setRunning, setMessages, startMessage, appendDelta, finalizeMessage } =
    useRoomStore();

  const [content, setContent] = useState("");
  const [interruptType, setInterruptType] = useState<InterruptType>("ask");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const socket = useMemo(() => getSocket(), []);

  useEffect(() => {
    setError(null);

    function onRoomState(s: any) {
      if (!s?.roomId || s.roomId !== roomId) return;
      setRoom({ roomId, roomName: s.name ?? roomName ?? "" });
      setRunning(!!s.running, s.turnIndex);
    }

    function onRoomMessages(payload: any) {
      if (payload?.roomId !== roomId) return;
      setMessages((payload.messages ?? []) as ChatMessage[]);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageStart(m: ChatMessage) {
      if (m.roomId !== roomId) return;
      startMessage(m);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageDelta(p: any) {
      if (p?.roomId !== roomId) return;
      appendDelta(p.messageId, p.delta ?? "");
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onMessageDone(m: ChatMessage) {
      if (m.roomId !== roomId) return;
      finalizeMessage(m);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }

    function onError(p: any) {
      if (p?.roomId && p.roomId !== roomId) return;
      setError(p?.message ?? "发生错误");
    }

    socket.on("room.state", onRoomState);
    socket.on("room.messages", onRoomMessages);
    socket.on("message.start", onMessageStart);
    socket.on("message.delta", onMessageDelta);
    socket.on("message.done", onMessageDone);
    socket.on("error", onError);

    socket.emit("room.join", { roomId }, (ack: any) => {
      if (!ack?.ok) setError(ack?.error ?? "加入房间失败");
      else {
        setRoom({ roomId, roomName: ack.room?.config?.name ?? "" });
        setRunning(!!ack.room?.running, ack.room?.turnIndex ?? 0);
        setMessages((ack.room?.messages ?? []) as ChatMessage[]);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  async function sendUserMessage() {
    setError(null);
    const text = content.trim();
    if (!text) return;

    setContent("");
    socket.emit("user.message", { roomId, content: text, interruptType }, (ack: any) => {
      if (!ack?.ok) setError(ack?.error ?? "发送失败");
    });

    if (interruptType === "stop") {
      // 让 stop 更直观：同时请求停止
      socket.emit("room.stop", { roomId });
    }
  }

  function startAuto() {
    setError(null);
    socket.emit("room.start", { roomId }, (ack: any) => {
      if (!ack?.ok) setError(ack?.error ?? "启动失败");
    });
  }

  function stopAuto() {
    setError(null);
    socket.emit("room.stop", { roomId }, (ack: any) => {
      if (!ack?.ok) setError(ack?.error ?? "停止失败");
    });
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
              状态：{running ? "自动对话中" : "已暂停"} · 回合：{turnIndex}
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
                <div key={m.id} className="flex gap-3">
                  <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-zinc-100 text-center text-xs leading-8 text-zinc-700">
                    {m.speakerName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{m.speakerName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {new Date(m.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900">
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block sm:w-48">
              <div className="text-sm font-medium text-zinc-700">插话类型</div>
              <select
                value={interruptType}
                onChange={(e) => setInterruptType(e.target.value as InterruptType)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-zinc-400"
              >
                {Object.entries(INTERRUPT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="block flex-1">
              <div className="text-sm font-medium text-zinc-700">你的话（中文）</div>
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void sendUserMessage();
                }}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-zinc-400"
                placeholder="Ctrl/⌘ + Enter 发送"
              />
            </label>

            <button
              onClick={() => void sendUserMessage()}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              发送
            </button>
          </div>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

