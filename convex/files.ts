import { v } from "convex/values"
import { query, mutation } from "./_generated/server"

function authorized(secret: string) {
  return secret === process.env.BOT_SECRET
}

// The gated zips, stored in Convex file storage.
export const getByFile = query({
  args: { file: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("files")
      .withIndex("by_file", (q) => q.eq("file", args.file))
      .order("desc")
      .first()
  },
})

export const add = mutation({
  args: {
    secret: v.string(),
    file: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")

    await ctx.db.insert("files", {
      file: args.file,
      fileName: args.fileName,
      storageId: args.storageId,
      contentType: args.contentType,
      createdAt: Date.now(),
    })
  },
})

// Admin: list recent storage uploads (to register dashboard-uploaded files).
export const listStorage = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.system.query("_storage").order("desc").take(10)
  },
})

// Admin: hands back a one-time upload URL so a script can push a file
// into storage without dashboard access.
export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")
    return await ctx.storage.generateUploadUrl()
  },
})

// Admin: register a file that was uploaded through the dashboard.
export const registerUploaded = mutation({
  args: {
    secret: v.string(),
    file: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    if (!authorized(args.secret)) throw new Error("Unauthorized")

    await ctx.db.insert("files", {
      file: args.file,
      fileName: args.fileName,
      storageId: args.storageId,
      contentType: args.contentType,
      createdAt: Date.now(),
    })
  },
})
