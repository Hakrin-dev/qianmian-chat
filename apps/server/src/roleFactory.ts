import { OpenAI } from "openai";
import { RoleAnalysisSchema, type RoleAnalysis, type RoleCard } from "@qianmian/shared";
import { promises as fs } from "node:fs";
import path from "node:path";

const CUSTOM_ROLES_PATH = path.resolve(import.meta.dirname ?? __dirname, "data", "custom-roles.json");

function makeId(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9一-鿿]/g, "_").slice(0, 12);
  return `custom_${slug}_${Date.now().toString(36)}`;
}

export async function analyzePromptForRole(
  openai: OpenAI,
  model: string,
  prompt: string,
): Promise<RoleAnalysis> {
  const systemPrompt = `你是一个角色创建助手。用户会描述他们想要创建的角色，你需要分析并输出结构化的角色数据。

输出必须是一个严格的 JSON 对象，包含以下字段：
- name: 角色的中文名字（2-6个字）
- avatar: 一个 emoji 表情符号作为头像
- templateId: "emotional"（情感陪伴）、"group"（群聊模拟）或 "task"（现实任务）之一
- identity: 角色的身份背景和性格描述（40-80字，详细描述性格特点）
- voice.tags: 3-5个口吻/性格标签
- voice.examples: 2-3句角色经典台词
- dos: 3-5条行为规范（应该做什么）
- donts: 3-5条禁忌行为（不应该做什么）
- format: 回复格式描述（15-30字）
- skills: 3-5个技能标签
- parameters.temperature: 0.3-1.0之间的数值（越低越理性，越高越创意）
- parameters.max_tokens: 200-350之间的整数
- regulateDimensions: 角色个性雷达图的5个维度值(0-100)：
  - creativity: 创意/脑洞度（0=保守务实，100=天马行空）
  - talkativeness: 话痨/活跃度（0=沉默寡言，100=积极话痨）
  - emotional: 情感丰富度（0=冷静理性，100=热情洋溢）
  - cooperativeness: 配合/亲和度（0=高冷疏离，100=亲和配合）
  - seriousness: 犀利/批判度（0=温和友善，100=直言不讳）

请根据用户的描述，精准地填充所有这些字段。确保角色性格一致、有特色。`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请为以下角色描述创建完整的角色数据：\n\n${prompt}` },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("LLM 未返回有效响应");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LLM 返回的不是有效 JSON");
  }

  const result = RoleAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`角色分析结果格式不正确: ${result.error.message}`);
  }

  return result.data;
}

export function analysisToRoleCard(analysis: RoleAnalysis): RoleCard {
  return {
    id: makeId(analysis.name),
    name: analysis.name,
    avatar: analysis.avatar,
    templateId: analysis.templateId,
    identity: analysis.identity,
    voice: analysis.voice,
    dos: analysis.dos,
    donts: analysis.donts,
    format: analysis.format,
    skills: analysis.skills,
    parameters: {
      temperature: analysis.parameters.temperature,
      max_tokens: analysis.parameters.max_tokens,
    },
  };
}

export async function loadCustomRoles(): Promise<RoleCard[]> {
  try {
    await fs.mkdir(path.dirname(CUSTOM_ROLES_PATH), { recursive: true });
    const raw = await fs.readFile(CUSTOM_ROLES_PATH, "utf-8");
    return JSON.parse(raw) as RoleCard[];
  } catch {
    return [];
  }
}

export async function saveCustomRole(role: RoleCard): Promise<void> {
  const roles = await loadCustomRoles();
  roles.push(role);
  await fs.mkdir(path.dirname(CUSTOM_ROLES_PATH), { recursive: true });
  await fs.writeFile(CUSTOM_ROLES_PATH, JSON.stringify(roles, null, 2), "utf-8");
}

export async function deleteCustomRole(roleId: string): Promise<boolean> {
  const roles = await loadCustomRoles();
  const idx = roles.findIndex((r) => r.id === roleId);
  if (idx < 0) return false;
  roles.splice(idx, 1);
  await fs.writeFile(CUSTOM_ROLES_PATH, JSON.stringify(roles, null, 2), "utf-8");
  return true;
}
