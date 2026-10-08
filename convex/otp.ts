import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

// All bot-side mutations require the shared secret from the bot's env, so
// the public deployment URL can't be abused directly.

export const startSession = mutation({
  args: {
    secret: v.string(),
    telegramId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.BOT_SECRET) {
      throw new Error("Unauthorized")
    }

    const existing = await ctx.db
      .query("pendingVerifications")
      .withIndex("by_telegram_id", (q) =>
        q.eq("telegramId", args.telegramId)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId: args.sessionId,
        createdAt: Date.now(),
      })
      return
    }

    await ctx.db.insert("pendingVerifications", {
      telegramId: args.telegramId,
      sessionId: args.sessionId,
      createdAt: Date.now(),
    })
  },
})

// Generates the OTP, ties it to the browser session, and returns it so the
// bot can send it in the Telegram chat.
export const issueOtp = mutation({
  args: {
    secret: v.string(),
    telegramId: v.string(),
    name: v.string(),
    username: v.string(),
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.BOT_SECRET) {
      throw new Error("Unauthorized")
    }

    // The pending entry carries the browser's sessionId from /start.
    const pending = await ctx.db
      .query("pendingVerifications")
      .withIndex("by_telegram_id", (q) =>
        q.eq("telegramId", args.telegramId)
      )
      .unique()

    if (!pending) {
      return { ok: false, error: "expired" }
    }
    const sessionId = pending.sessionId

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    const existing = await ctx.db
      .query("otpSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", sessionId))
      .unique()

    const record = {
      sessionId: args.sessionId,
      otp,
      telegramId: args.telegramId,
      telegramName: args.name,
      telegramUsername: args.username,
      phoneNumber: args.phoneNumber,
      verified: false,
      attempts: 0,
      createdAt: Date.now(),
    }

    if (existing) {
      await ctx.db.patch(existing._id, record)
    } else {
      await ctx.db.insert("otpSessions", record)
    }

    await ctx.db.delete(pending._id)
    return { ok: true, otp, sessionId }
  },
})

// Public: the website verifies the entered code. Brute-force is throttled by
// counting attempts and expiring the session after five wrong tries.
export const verify = mutation({
  args: {
    sessionId: v.string(),
    code: v.string(),
    project: v.string(),
    file: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("otpSessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique()

    if (!session) {
      return {
        ok: false,
        error: 'Session not found. Please click "Verify via Telegram" again.',
      }
    }

    if (session.attempts >= 5) {
      await ctx.db.delete(session._id)
      return {
        ok: false,
        error: "Too many attempts. Please verify via Telegram again.",
      }
    }

    if (session.otp !== args.code.trim()) {
      await ctx.db.patch(session._id, { attempts: session.attempts + 1 })
      return { ok: false, error: "Incorrect code. Check your Telegram." }
    }

    const file = await ctx.db
      .query("files")
      .withIndex("by_file", (q) => q.eq("file", args.file))
      .order("desc")
      .first()

    if (!file) {
      return { ok: false, error: "The requested file is not available." }
    }

    const downloadUrl = await ctx.storage.getUrl(file.storageId)

    await ctx.db.insert("verifiedDownloads", {
      telegramId: session.telegramId,
      telegramName: session.telegramName,
      telegramUsername: session.telegramUsername,
      phoneNumber: session.phoneNumber,
      project: args.project,
      verifiedAt: Date.now(),
    })

    await ctx.db.delete(session._id)

    return { ok: true, downloadUrl, fileName: file.fileName }
  },
})
