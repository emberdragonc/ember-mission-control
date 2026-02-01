import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Agents in the squad
  agents: defineTable({
    name: v.string(),           // "Forge"
    agentId: v.string(),        // "forge" 
    role: v.string(),           // "Smart Contract Builder"
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
    sessionKey: v.string(),     // "agent:forge:main"
    level: v.union(v.literal("intern"), v.literal("specialist"), v.literal("lead")),
    currentTaskId: v.optional(v.id("tasks")),
    tools: v.optional(v.array(v.string())),
  }).index("by_agentId", ["agentId"]),

  // Task queue
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
    assigneeIds: v.array(v.string()),  // agent IDs
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  // Comments on tasks
  messages: defineTable({
    taskId: v.id("tasks"),
    agentId: v.string(),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_task", ["taskId"]),

  // Activity feed
  activities: defineTable({
    type: v.string(),  // "task_created", "comment_added", "status_changed", etc.
    agentId: v.string(),
    message: v.string(),
    taskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
  }).index("by_time", ["createdAt"]),

  // Documents/deliverables
  documents: defineTable({
    title: v.string(),
    content: v.optional(v.string()),
    type: v.union(
      v.literal("deliverable"),
      v.literal("research"),
      v.literal("protocol"),
      v.literal("audit")
    ),
    taskId: v.optional(v.id("tasks")),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_task", ["taskId"]),

  // @mention notifications
  notifications: defineTable({
    mentionedAgentId: v.string(),
    fromAgentId: v.string(),
    content: v.string(),
    taskId: v.optional(v.id("tasks")),
    delivered: v.boolean(),
    createdAt: v.number(),
  }).index("by_agent_undelivered", ["mentionedAgentId", "delivered"]),
});
