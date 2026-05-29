import { z } from "zod";

export const RoomTemplateIdSchema = z.enum(["emotional", "group", "task"]);
export type RoomTemplateId = z.infer<typeof RoomTemplateIdSchema>;

export const InterruptTypeSchema = z.enum([
  "ask",
  "correct",
  "add_constraint",
  "add_setting",
  "change_goal",
  "stop",
  "mute_roles",
  "regulate_roles", // 情感调节：用滑块调节角色个性维度
]);
export type InterruptType = z.infer<typeof InterruptTypeSchema>;

export const RoleCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().min(1).optional(),
  templateId: RoomTemplateIdSchema,
  identity: z.string().min(1),
  voice: z
    .object({
      tags: z.array(z.string().min(1)).default([]),
      examples: z.array(z.string().min(1)).max(3).default([]),
    })
    .default({ tags: [], examples: [] }),
  dos: z.array(z.string().min(1)).default([]),
  donts: z.array(z.string().min(1)).default([]),
  format: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).default([]),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      top_p: z.number().min(0).max(1).optional(),
      max_tokens: z.number().int().min(16).max(2048).optional(),
    })
    .default({}),
});
export type RoleCard = z.infer<typeof RoleCardSchema>;

export const RoomConfigSchema = z.object({
  name: z
    .string()
    .min(1, "房间名不能为空")
    .max(30, "房间名最多 30 个字"),
  templateId: RoomTemplateIdSchema,
  selectedRoleIds: z.array(z.string().min(1)).min(1),
  activeRoleIds: z.array(z.string().min(1)).min(1),
  maxTurns: z.number().int().min(1).max(60),
  windowSize: z.number().int().min(5).max(50).default(20),
});
export type RoomConfig = z.infer<typeof RoomConfigSchema>;

export const DirectorDecisionSchema = z.object({
  nextSpeaker: z.object({
    type: z.enum(["role", "host", "narrator"]),
    id: z.string().min(1).optional(),
  }),
  intent: z.enum([
    "respond",
    "question",
    "challenge",
    "summarize",
    "transition",
    "clarify_interrupt",
    "handle_correction",
  ]),
  phase: z.string().min(1).default("free"),
  instruction: z.string().min(1),
  shouldStop: z.boolean(),
  stopReason: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type DirectorDecision = z.infer<typeof DirectorDecisionSchema>;

export const UserMessageInputSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().min(1).max(1000),
  interruptType: InterruptTypeSchema.default("ask"),
  mentionRoleIds: z.array(z.string()).optional(),
});
export type UserMessageInput = z.infer<typeof UserMessageInputSchema>;

export const CreateRoomInputSchema = z.object({
  name: RoomConfigSchema.shape.name,
  templateId: RoomTemplateIdSchema,
  selectedRoleIds: z.array(z.string().min(1)).min(1),
});
export type CreateRoomInput = z.infer<typeof CreateRoomInputSchema>;

// ===== 关系/记忆相关类型 =====

/** 角色与用户的关系/性格演化存储 */
export type RelationshipState = {
  intimacy: number; // 亲密度 0-100
  dynamicTrait: string; // 动态演化的性格标签
  memo: string; // 关键记忆点
};

/** 跨角色记忆：crossMemory[roleId_A][roleId_B] = 记忆项列表 */
export type CrossMemoryEntry = {
  content: string;   // 记忆内容摘要
  createdAt: number;
};
export type CrossMemory = Record<string, Record<string, CrossMemoryEntry[]>>;

/** 关系演化 LLM 返回结果 */
export const EvolveResultSchema = z.object({
  intimacyDelta: z.number().min(-10).max(10),
  newTrait: z.string().min(1),
  newMemo: z.string().min(1),
});
export type EvolveResult = z.infer<typeof EvolveResultSchema>;

/** 跨角色记忆分析 LLM 返回结果 */
export const CrossMemoryAnalysisSchema = z.object({
  mentions: z.array(z.object({
    targetRoleId: z.string().min(1),
    summary: z.string().min(1),
  })).default([]),
});
export type CrossMemoryAnalysis = z.infer<typeof CrossMemoryAnalysisSchema>;

// ===== 情感调节相关类型 =====

/** 自定义维度元数据 */
export type CustomDimensionMeta = {
  key: string;
  label: string;
  low: string;
  high: string;
};

/** 单个角色的调节维度值 (0-100) */
export const RegulateDimensionsSchema = z.object({
  creativity: z.number().min(0).max(100),
  talkativeness: z.number().min(0).max(100),
  emotional: z.number().min(0).max(100),
  cooperativeness: z.number().min(0).max(100),
  seriousness: z.number().min(0).max(100),
  custom: z.record(z.string(), z.number().min(0).max(100)).default({}),
});
export type RegulateDimensions = z.infer<typeof RegulateDimensionsSchema>;

/** 房间内各角色的调节配置 */
export type RegulateConfig = Record<string, RegulateDimensions>;

// ===== 角色创建相关类型 =====

/** LLM 分析 prompt 后返回的角色建议 */
export const RoleAnalysisSchema = z.object({
  name: z.string().min(1),
  avatar: z.string().min(1),
  templateId: RoomTemplateIdSchema,
  identity: z.string().min(1),
  voice: z.object({
    tags: z.array(z.string().min(1)),
    examples: z.array(z.string().min(1)).max(3),
  }),
  dos: z.array(z.string().min(1)),
  donts: z.array(z.string().min(1)),
  format: z.string().min(1),
  skills: z.array(z.string().min(1)),
  parameters: z.object({
    temperature: z.number().min(0).max(2),
    max_tokens: z.number().int().min(16).max(2048),
  }),
  regulateDimensions: RegulateDimensionsSchema,
});
export type RoleAnalysis = z.infer<typeof RoleAnalysisSchema>;

/** 创建角色请求 */
export const CreateCustomRoleInputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  role: RoleAnalysisSchema,
});
export type CreateCustomRoleInput = z.infer<typeof CreateCustomRoleInputSchema>;