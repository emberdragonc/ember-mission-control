import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get undelivered notifications for an agent
export const getUndelivered = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_agent_undelivered", (q) => 
        q.eq("mentionedAgentId", args.agentId).eq("delivered", false)
      )
      .collect();
  },
});

// Mark notifications as delivered
export const markDelivered = mutation({
  args: { notificationIds: v.array(v.id("notifications")) },
  handler: async (ctx, args) => {
    for (const id of args.notificationIds) {
      await ctx.db.patch(id, { delivered: true });
    }
  },
});

// Send a direct notification
export const send = mutation({
  args: {
    toAgentId: v.string(),
    fromAgentId: v.string(),
    content: v.string(),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      mentionedAgentId: args.toAgentId,
      fromAgentId: args.fromAgentId,
      content: args.content,
      taskId: args.taskId,
      delivered: false,
      createdAt: Date.now(),
    });
  },
});

// Broadcast to all agents
export const broadcast = mutation({
  args: {
    fromAgentId: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const agents = await ctx.db.query("agents").collect();
    const now = Date.now();

    for (const agent of agents) {
      if (agent.agentId !== args.fromAgentId) {
        await ctx.db.insert("notifications", {
          mentionedAgentId: agent.agentId,
          fromAgentId: args.fromAgentId,
          content: args.content,
          delivered: false,
          createdAt: now,
        });
      }
    }

    return { notified: agents.length - 1 };
  },
});

// Agent heartbeat check - returns notifications and assigned tasks
export const check = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    // Get undelivered notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_agent_undelivered", (q) => 
        q.eq("mentionedAgentId", args.agentId).eq("delivered", false)
      )
      .collect();

    // Get assigned tasks
    const allTasks = await ctx.db.query("tasks").collect();
    const assignedTasks = allTasks.filter(t => 
      t.assigneeIds.includes(args.agentId) &&
      ["assigned", "in_progress", "review"].includes(t.status)
    );

    return {
      hasWork: notifications.length > 0 || assignedTasks.length > 0,
      notifications,
      tasks: assignedTasks,
    };
  },
});
