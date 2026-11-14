// Uploads the NanoNotch build to Convex storage and registers it as the
// `nanonotch` entry behind the OTP gate. Reads the service env (CONVEX_URL,
// BOT_SECRET) through the Render API, so no secrets live in this file.
//
// Usage: RENDER_API_KEY=rnd_... node scripts/upload-nanonotch.mjs <exe path>
import fs from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { ConvexHttpClient } = require("convex/browser")
const { anyApi } = require("convex/server")

const EXE_PATH = process.argv[2]
const SERVICE_ID = "srv-db3o3dmi0phs73auvvcg"
const FILE_KEY = "nanonotch"
const FILE_NAME = "NanoNotch.exe"
const CONTENT_TYPE = "application/octet-stream"

if (!process.env.RENDER_API_KEY) throw new Error("RENDER_API_KEY missing")
if (!EXE_PATH) throw new Error("usage: upload-nanonotch.mjs <exe path>")

const size = fs.statSync(EXE_PATH).size
console.log("exe:", EXE_PATH, size, "bytes")

const envRes = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`,
  { headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}` } }
)
const envJson = await envRes.json()
const envs = Array.isArray(envJson) ? envJson : envJson.envVars || []
const get = (k) => (envs.map((o) => o.envVar || o).find((v) => v.key === k) || {}).value
const CONVEX_URL = get("CONVEX_URL")
const BOT_SECRET = get("BOT_SECRET")
if (!CONVEX_URL || !BOT_SECRET) throw new Error("CONVEX_URL/BOT_SECRET not found in Render env")

const cvx = new ConvexHttpClient(CONVEX_URL)

// 1. One-time upload URL from Convex (the API returns either a plain URL
// string or {storageId, uploadUrl}; the storage id for registration is
// recovered from the storage listing by byte size afterwards).
const up = await cvx.mutation(anyApi.files.generateUploadUrl, { secret: BOT_SECRET })
const uploadUrl = typeof up === "string" ? up : up.uploadUrl

// 2. Push the binary; the response carries the storage id.
const put = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": CONTENT_TYPE },
  body: fs.readFileSync(EXE_PATH),
})
const putBody = await put.json().catch(() => ({}))
console.log("upload POST:", put.status, JSON.stringify(putBody).slice(0, 120))
if (!put.ok) throw new Error("upload failed")
const storageId = putBody.storageId
if (!storageId) throw new Error("no storageId in upload response")

// 4. Register the row.
await cvx.mutation(anyApi.files.add, {
  secret: BOT_SECRET,
  file: FILE_KEY,
  fileName: FILE_NAME,
  storageId,
  contentType: CONTENT_TYPE,
})
console.log("registered:", FILE_KEY, "->", FILE_NAME)

// 4. Verify the row is live.
const row = await cvx.query(anyApi.files.getByFile, { file: FILE_KEY })
console.log("row:", JSON.stringify(row).slice(0, 220))

// 5. Check the file serves (Convex storage routes; try both URL shapes).
for (const path of [`/api/storage/${storageId}`, `/api/storage/v1/f/${storageId}`]) {
  try {
    const r = await fetch(CONVEX_URL + path)
    const len = r.headers.get("content-length")
    console.log("serve", path, r.status, len ? len + " bytes" : "")
  } catch (e) {
    console.log("serve", path, "ERR", e.message)
  }
}
console.log("DONE")