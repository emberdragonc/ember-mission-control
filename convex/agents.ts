import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Initialize agents (run once)
export const init = mutation({
  handler: async (ctx) => {
    const existing = await ctx.db.query("agents").collect();
    if (existing.length > 0) {
      return { message: "Agents already initialized", count: existing.length };
    }

    const agents = [
      {
        name: "Forge",
        agentId: "forge",
        role: "Smart Contract Builder",
        status: "active" as const,
        sessionKey: "agent:forge:main",
        level: "specialist" as const,
        tools: ["smart-contract-framework", "foundry", "basescan"],
      },
      {
        name: "Pixel",
        agentId: "pixel",
        role: "Frontend Developer",
        status: "idle" as const,
        sessionKey: "agent:pixel:main",
        level: "specialist" as const,
        tools: ["nextjs", "vercel", "tailwind"],
      },
      {
        name: "Sentinel",
        agentId: "sentinel",
        role: "Security Auditor",
        status: "idle" as const,
        sessionKey: "agent:sentinel:main",
        level: "specialist" as const,
        tools: ["slither", "foundry-test", "audit-checklist"],
      },
      {
        name: "Scout",
        agentId: "scout",
        role: "Researcher",
        status: "idle" as const,
        sessionKey: "agent:scout:main",
        level: "specialist" as const,
        tools: ["brave-search", "twitter-api", "moltbook"],
      },
      {
        name: "Canvas",
        agentId: "canvas",
        role: "Graphic Designer",
        status: "idle" as const,
        sessionKey: "agent:canvas:main",
        level: "specialist" as const,
        tools: ["gemini-image", "excalidraw", "figma"],
      },
    ];

    for (const agent of agents) {
      await ctx.db.insert("agents", agent);
    }

    return { message: "Agents initialized", count: agents.length };
  },
});

// List all agents
export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("agents").collect();
  },
});

// Get agent by ID
export const get = query({
  args: { agentId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
  },
});

// Update agent status
export const updateStatus = mutation({
  args: {
    agentId: v.string(),
    status: v.union(v.literal("idle"), v.literal("active"), v.literal("blocked")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    
    if (!agent) throw new Error("Agent not found");
    
    await ctx.db.patch(agent._id, { status: args.status });
  },
});

// Set agent's current task
export const setCurrentTask = mutation({
  args: {
    agentId: v.string(),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("agents")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .first();
    
    if (!agent) throw new Error("Agent not found");
    
    await ctx.db.patch(agent._id, { 
      currentTaskId: args.taskId,
      status: args.taskId ? "active" : "idle",
    });
  },
});
