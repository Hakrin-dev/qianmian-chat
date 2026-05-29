import type { RoleAnalysis, RoleCard, RoomTemplateId } from "@qianmian/shared";
import { SERVER_URL } from "./config";

export async function fetchRoles(templateId?: RoomTemplateId): Promise<RoleCard[]> {
  const url = templateId
    ? `${SERVER_URL}/roles?templateId=${encodeURIComponent(templateId)}`
    : `${SERVER_URL}/roles`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`获取角色失败：${res.status}`);
  return (await res.json()) as RoleCard[];
}

export type HistoryRoom = {
  id: string;
  name: string;
  templateId: RoomTemplateId;
  lastMessage: string;
  messageCount: number;
  createdAt: number;
};

export async function fetchHistory(): Promise<HistoryRoom[]> {
  const res = await fetch(`${SERVER_URL}/rooms/history`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取历史对话失败");
  return res.json();
}

export async function analyzePrompt(prompt: string): Promise<{ ok: true; analysis: RoleAnalysis }> {
  const res = await fetch(`${SERVER_URL}/roles/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "分析失败" }));
    throw new Error((err as { error?: string }).error ?? "分析失败");
  }
  return res.json();
}

export async function createCustomRole(input: {
  prompt: string;
  role: RoleAnalysis;
}): Promise<{ ok: true; role: RoleCard }> {
  const res = await fetch(`${SERVER_URL}/roles/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "创建失败" }));
    throw new Error((err as { error?: string }).error ?? "创建失败");
  }
  return res.json();
}

export async function fetchCustomRoles(): Promise<RoleCard[]> {
  const res = await fetch(`${SERVER_URL}/roles/custom`, { cache: "no-store" });
  if (!res.ok) throw new Error("获取自定义角色失败");
  return res.json();
}

export async function deleteRoom(roomId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除房间失败");
}

export async function deleteCustomRoleApi(roleId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/roles/custom/${encodeURIComponent(roleId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除角色失败");
}

