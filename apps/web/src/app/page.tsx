"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoleCard, RoomTemplateId } from "@qianmian/shared";
import { fetchRoles } from "@/lib/api";
import { getSocket } from "@/lib/socket";

const TEMPLATE_LABEL: Record<RoomTemplateId, string> = {
  casual: "闲聊群像",
  realistic: "现实场景",
  task: "任务协作",
};

export default function HomePage() {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<RoomTemplateId>("casual");
  const [roomName, setRoomName] = useState("千面聊天室");
  const [roles, setRoles] = useState<RoleCard[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedRoleIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchRoles(templateId)
      .then((list) => {
        if (cancelled) return;
        setRoles(list);
        const next: Record<string, boolean> = {};
        for (const r of list.slice(0, 3)) next[r.id] = true;
        setSelected(next);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "获取角色失败");
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  async function onCreateRoom() {
    setError(null);
    if (!roomName.trim()) return setError("房间名不能为空");
    if (selectedRoleIds.length < 2) return setError("请至少选择 2 个角色");

    setLoading(true);
    try {
      const socket = getSocket();
      const res = await new Promise<any>((resolve) => {
        socket.emit(
          "room.create",
          { name: roomName.trim(), templateId, selectedRoleIds },
          (ack: any) => resolve(ack),
        );
      });
      if (!res?.ok) throw new Error("创建房间失败");
      const roomId = res.room.id as string;
      router.push(`/room/${encodeURIComponent(roomId)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "创建房间失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">千面聊天</h1>
          <p className="mt-2 text-sm text-zinc-600">
            选择房间类型与角色，让他们用中文自动对话；你可以随时插话。
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-lg font-semibold">创建房间</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <div className="text-sm font-medium text-zinc-700">房间名（中文）</div>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-zinc-400"
                  placeholder="例如：周一夜聊 / 面试模拟 / 产品评审"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-700">房间类型</div>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value as RoomTemplateId)}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 outline-none focus:border-zinc-400"
                >
                  {Object.entries(TEMPLATE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={onCreateRoom}
                disabled={loading}
                className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {loading ? "创建中..." : "创建并进入房间"}
              </button>

              {error ? <div className="text-sm text-red-600">{error}</div> : null}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h2 className="text-lg font-semibold">选择角色（建议 3-6 个）</h2>
            <p className="mt-1 text-xs text-zinc-600">当前已选：{selectedRoleIds.length} 个</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3 hover:border-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={!!selected[r.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-zinc-600">{r.identity}</div>
                    {r.voice?.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.voice.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-10 text-xs text-zinc-500">
          提示：默认先用“模拟流式”跑通体验；设置模型环境变量后会自动切换为真实大模型流式输出。
        </footer>
      </div>
    </div>
  );
}
