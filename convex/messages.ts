import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Add a comment to a task
export const create = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const now = Date.now();

    // Create the message
    const messageId = await ctx.db.insert("messages", {
      taskId: args.taskId,
      agentId: args.agentId,
      content: args.content,
      createdAt: now,
    });

    // Update task timestamp
    await ctx.db.patch(args.taskId, { updatedAt: now });

    // Log activity
    await ctx.db.insert("activities", {
      type: "comment_added",
      agentId: args.agentId,
      message: `Comment on task: "${args.content.slice(0, 50)}..."`,
      taskId: args.taskId,
      createdAt: now,
    });

    // Parse @mentions and notify
    const mentions = args.content.match(/@(\w+)/g) || [];
    for (const mention of mentions) {
      const mentionedAgent = mention.slice(1);
      if (mentionedAgent !== args.agentId) {
        await ctx.db.insert("notifications", {
          mentionedAgentId: mentionedAgent,
          fromAgentId: args.agentId,
          content: `@${args.agentId} mentioned you: "${args.content.slice(0, 100)}"`,
          taskId: args.taskId,
          delivered: false,
          createdAt: now,
        });
      }
    }

    // Notify all task assignees (thread subscription)
    for (const assignee of task.assigneeIds) {
      if (assignee !== args.agentId && !mentions.includes(`@${assignee}`)) {
        await ctx.db.insert("notifications", {
          mentionedAgentId: assignee,
          fromAgentId: args.agentId,
          content: `💬 New comment on "${task.title}" from @${args.agentId}`,
          taskId: args.taskId,
          delivered: false,
          createdAt: now,
        });
      }
    }

    return messageId;
  },
});

// Get messages for a task
export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
  },
});
