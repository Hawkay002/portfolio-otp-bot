import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  // Telegram chat -> browser session link, created by /start <sessionId>.
  pendingVerifications: defineTable({
    telegramId: v.string(),
    sessionId: v.string(),
    createdAt: v.number(),
  })
    .index("by_telegram_id", ["telegramId"])
    .index("by_session_id", ["sessionId"]),

  // One OTP per browser session; the website verifies against this table.
  otpSessions: defineTable({
    sessionId: v.string(),
    otp: v.string(),
    telegramId: v.string(),
    telegramName: v.string(),
    telegramUsername: v.string(),
    phoneNumber: v.string(),
    verified: v.boolean(),
    attempts: v.number(),
    createdAt: v.number(),
  }).index("by_session_id", ["sessionId"]),

  // Audit log of successful gated downloads.
  verifiedDownloads: defineTable({
    telegramId: v.string(),
    telegramName: v.string(),
    telegramUsername: v.string(),
    phoneNumber: v.string(),
    project: v.string(),
    verifiedAt: v.number(),
  }),

  // The gated zips, stored in Convex file storage.
  files: defineTable({
    file: v.string(),
    fileName: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    createdAt: v.number(),
  }).index("by_file", ["file"]),
})
