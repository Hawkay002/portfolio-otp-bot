// One-time seed: uploads the gated zips into Convex file storage and
// registers them in the files table.
//
//   node scripts/seed-files.mjs
//
// Env: CONVEX_URL (deployment URL), BOT_SECRET (must match the bot's env).
// Files: ../React-portfolio/public/downloads/*.zip

import fs from "node:fs"
import path from "node:path"

const CONVEX_URL = process.env.CONVEX_URL
const BOT_SECRET = process.env.BOT_SECRET

if (!CONVEX_URL || !BOT_SECRET) {
  console.error("Set CONVEX_URL and BOT_SECRET first.")
  process.exit(1)
}

const FILES = [
  {
    file: "ransomware",
    fileName: "Ransomware-main.zip",
    contentType: "application/zip",
    source: "../React-portfolio/public/downloads/Ransomware-main.zip",
  },
  {
    file: "unredactor",
    fileName: "unredactor.py-main.zip",
    contentType: "application/zip",
    source: "../React-portfolio/public/downloads/unredactor.py-main.zip",
  },
]

for (const entry of FILES) {
  const bytes = fs.readFileSync(path.join(import.meta.dirname, entry.source))

  const uploadRes = await fetch(`${CONVEX_URL}/storage/upload`, {
    method: "POST",
    headers: { "Content-Type": entry.contentType },
    body: bytes,
  })

  if (!uploadRes.ok) {
    console.error(`Upload failed for ${entry.fileName}:`, uploadRes.status)
    process.exit(1)
  }

  const { storageId } = await uploadRes.json()

  const clientRes = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "files:add",
      args: {
        secret: BOT_SECRET,
        file: entry.file,
        fileName: entry.fileName,
        storageId,
        contentType: entry.contentType,
      },
      format: "json",
    }),
  })

  const result = await clientRes.json()
  if (result.success === false) {
    console.error(`Register failed for ${entry.fileName}:`, result.errorMessage)
    process.exit(1)
  }

  console.log(`seeded ${entry.file} (${entry.fileName}, storageId ${storageId})`)
}

console.log("done")
