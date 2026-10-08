import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

function authorized(secret: string) {
  return secret === process.env.BOT_SECRET
}

export const listAvailable = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")

    return await ctx.db
      .query("accessCodes")
      .withIndex("by_used", (q) => q.eq("isUsed", false))
      .order("desc")
      .collect()
  },
})

export const addMany = mutation({
  args: {
    secret: v.string(),
    resourceName: v.string(),
    downloadUrl: v.string(),
    codes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")

    for (const code of args.codes) {
      await ctx.db.insert("accessCodes", {
        code,
        resourceName: args.resourceName,
        downloadUrl: args.downloadUrl,
        isUsed: false,
        createdAt: Date.now(),
      })
    }
    return args.codes.length
  },
})

export const deleteUsed = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")

    const used = await ctx.db
      .query("accessCodes")
      .withIndex("by_used", (q) => q.eq("isUsed", true))
      .collect()

    for (const doc of used) {
      await ctx.db.delete(doc._id)
    }
    return used.length
  },
})
