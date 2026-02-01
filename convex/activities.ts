import { query } from "./_generated/server";
import { v } from "convex/values";

// Get recent activity
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_time")
      .order("desc")
      .take(limit);
    return activities;
  },
});

// Get activity for a specific task
export const byTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const activities = await ctx.db
      .query("activities")
      .filter((q) => q.eq(q.field("taskId"), args.taskId))
      .collect();
    return activities;
  },
});

// Generate daily standup data
export const standup = query({
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    const agents = await ctx.db.query("agents").collect();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const todayActivities = await ctx.db
      .query("activities")
      .withIndex("by_time")
      .filter((q) => q.gte(q.field("createdAt"), todayMs))
      .collect();

    return {
      completed: tasks.filter(t => t.status === "done" && t.updatedAt >= todayMs),
      inProgress: tasks.filter(t => t.status === "in_progress"),
      blocked: tasks.filter(t => t.status === "blocked"),
      review: tasks.filter(t => t.status === "review"),
      inbox: tasks.filter(t => t.status === "inbox"),
      agents: agents.map(a => ({
        ...a,
        activeTask: tasks.find(t => t._id === a.currentTaskId),
      })),
      todayActivityCount: todayActivities.length,
    };
  },
});
