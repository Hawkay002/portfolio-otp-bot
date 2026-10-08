const fs = require("fs");
const token = JSON.parse(
  fs.readFileSync(
    process.env.USERPROFILE + "/.convex/config.json",
    "utf8"
  )
).accessToken;

const base = "https://api.convex.dev/api";

async function get(path) {
  const res = await fetch(base + path, {
    headers: { Authorization: "Bearer " + token },
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const projects = await get("/api/teams/shovith2002/projects");
const portfolio = projects.find((p) => p.name === "portfolio");
console.log("portfolio:", portfolio.id, portfolio.slug, "prod:", portfolio.prodDeploymentName, "dev:", portfolio.devDeploymentName);

const deployments = await get(
  `/api/deployments?team=${portfolio.teamId}&project=${portfolio.id}`
);
console.log("deployments response:", JSON.stringify(deployments).slice(0, 800));
