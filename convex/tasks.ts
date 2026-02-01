import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Create a new task
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const assignees = args.assigneeIds || [];
    
    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: assignees.length > 0 ? "assigned" : "inbox",
      assigneeIds: assignees,
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await ctx.db.insert("activities", {
      type: "task_created",
      agentId: "system",
      message: `Task created: ${args.title}`,
      taskId,
      createdAt: now,
    });

    // Notify assignees
    for (const agentId of assignees) {
      await ctx.db.insert("notifications", {
        mentionedAgentId: agentId,
        fromAgentId: "system",
        content: `📋 New task assigned: ${args.title}`,
        taskId,
        delivered: false,
        createdAt: now,
      });
    }

    return taskId;
  },
});

// Update task status
export const updateStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("done"),
      v.literal("blocked")
    ),
    agentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const oldStatus = task.status;
    await ctx.db.patch(args.taskId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      type: "status_changed",
      agentId: args.agentId || "system",
      message: `Task #${args.taskId}: ${oldStatus} → ${args.status}`,
      taskId: args.taskId,
      createdAt: Date.now(),
    });
  },
});

// Assign agents to task
export const assign = mutation({
  args: {
    taskId: v.id("tasks"),
    agentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const newAssignees = [...new Set([...task.assigneeIds, ...args.agentIds])];
    
    await ctx.db.patch(args.taskId, {
      assigneeIds: newAssignees,
      status: task.status === "inbox" ? "assigned" : task.status,
      updatedAt: Date.now(),
    });

    // Notify new assignees
    for (const agentId of args.agentIds) {
      if (!task.assigneeIds.includes(agentId)) {
        await ctx.db.insert("notifications", {
          mentionedAgentId: agentId,
          fromAgentId: "system",
          content: `📋 You've been assigned to: ${task.title}`,
          taskId: args.taskId,
          delivered: false,
          createdAt: Date.now(),
        });
      }
    }
  },
});

// List tasks
export const list = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .collect();
    }
    return await ctx.db.query("tasks").collect();
  },
});

// Get task with comments
export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    const comments = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return { ...task, comments };
  },
});
