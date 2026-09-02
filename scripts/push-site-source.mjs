import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

const dir = process.cwd();
const payload = await new Promise((resolve, reject) => {
  let input = "";
  process.stdin.setEncoding("utf8");
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("data", chunk => {
    input += chunk;
    try {
      const value = JSON.parse(input);
      process.stdin.pause();
      resolve(value);
    } catch (error) {
      if (input.length > 10000) reject(error);
    }
  });
  process.stdin.on("end", () => {
    if (!input) reject(new Error("Missing repository credential payload."));
  });
});

const ignored = new Set([".git", ".next", ".vinext", ".wrangler", "dist", "node_modules", "outputs", "work"]);
const files = [];

async function walk(relative = "") {
  const entries = await fsp.readdir(path.join(dir, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.name === ".DS_Store" || entry.name.startsWith(".env")) continue;
    const filepath = path.posix.join(relative.split(path.sep).join(path.posix.sep), entry.name);
    if (entry.isDirectory()) await walk(filepath);
    else if (entry.isFile()) files.push(filepath);
  }
}

await git.init({ fs, dir, defaultBranch: payload.branch });
await walk();
for (const filepath of files) await git.add({ fs, dir, filepath });

const commitSha = await git.commit({
  fs,
  dir,
  message: "Publish What to Eat mobile web app",
  author: { name: "Codex", email: "codex@openai.com" },
});

const result = await git.push({
  fs,
  http,
  dir,
  url: payload.remote,
  ref: payload.branch,
  remoteRef: payload.branch,
  headers: { Authorization: `Bearer ${payload.token}` },
});

if (result.errors?.length) throw new Error(result.errors.join("; "));
process.stdout.write(`${commitSha}\n`);
