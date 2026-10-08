import fs from "node:fs"

// Usage: node scripts/upload-one.mjs <zip path> <upload url>
const [zipPath, rawUrl] = process.argv.slice(2)
const uploadUrl = rawUrl.replace(/^"+|"+$/g, "")

const body = fs.readFileSync(zipPath)

const res = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": "application/zip" },
  body,
})

console.log(res.status, (await res.text()).slice(0, 120))
