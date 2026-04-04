#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".pwahatch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const DEFAULT_URL = "http://localhost:3000";

const CATEGORIES = [
  "business",
  "education",
  "entertainment",
  "finance",
  "food & drink",
  "games",
  "health & fitness",
  "lifestyle",
  "music",
  "news",
  "photo & video",
  "productivity",
  "shopping",
  "social",
  "sports",
  "travel",
  "utilities",
  "weather",
];

// ── Config ──────────────────────────────────────────────

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

// ── Prompts ─────────────────────────────────────────────

function ask(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    let input = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r") {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (ch === "\u0003") {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.exit();
      } else if (ch === "\u007f" || ch === "\b") {
        input = input.slice(0, -1);
      } else {
        input += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

// ── Manifest preview ────────────────────────────────────

async function crawlManifest(siteUrl) {
  const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "pwahatch-cli/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);

  const html = await res.text();
  const match = html.match(
    /<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']|<link[^>]*href=["']([^"']+)["'][^>]*rel=["']manifest["']/i
  );
  if (!match) throw new Error("No web app manifest found on that page");

  const manifestUrl = new URL(match[1] || match[2], url).href;
  const mRes = await fetch(manifestUrl, {
    headers: { "User-Agent": "pwahatch-cli/1.0" },
  });
  if (!mRes.ok)
    throw new Error(`Failed to fetch manifest (${mRes.status})`);

  const manifest = await mRes.json();

  return {
    name: manifest.name || manifest.short_name || "Untitled",
    description: manifest.description || null,
    icons: Array.isArray(manifest.icons) ? manifest.icons.length : 0,
    themeColor: manifest.theme_color || null,
  };
}

// ── Commands ────────────────────────────────────────────

async function login(args) {
  let baseUrl = DEFAULT_URL;
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    baseUrl = args[urlIdx + 1].replace(/\/$/, "");
  }

  console.log();
  const email = await ask("  Email: ");
  const password = await askPassword("  Password: ");

  if (!email || !password) {
    console.error("\n  \x1b[31m✗\x1b[0m Email and password required");
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  if (!res.ok && res.status !== 302) {
    const data = await res.json().catch(() => ({}));
    console.error(
      `\n  \x1b[31m✗\x1b[0m ${data.message || "Invalid credentials"}`
    );
    process.exit(1);
  }

  // Extract session token from Set-Cookie
  const cookies = res.headers.getSetCookie?.() || [];
  let token = null;
  for (const c of cookies) {
    const m = c.match(
      /(?:better-auth\.session_token|session_token)=([^;]+)/
    );
    if (m) {
      token = m[1];
      break;
    }
  }

  // Fallback: check response body
  if (!token) {
    try {
      const text = await res.text();
      const data = JSON.parse(text);
      token = data.session?.token || data.token;
    } catch {}
  }

  if (!token) {
    console.error("\n  \x1b[31m✗\x1b[0m Could not extract session token");
    process.exit(1);
  }

  saveConfig({ token, baseUrl });
  console.log(`\n  \x1b[32m✓\x1b[0m Logged in as ${email}\n`);
}

async function submit(args) {
  const config = loadConfig();
  if (!config.token) {
    console.error("\n  \x1b[31m✗\x1b[0m Not logged in. Run: pwahatch login\n");
    process.exit(1);
  }

  // Parse args
  let url = null;
  let category = null;
  let isPublic = true;
  let hasVisFlag = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && args[i + 1]) {
      category = args[++i].toLowerCase();
    } else if (args[i] === "--private") {
      isPublic = false;
      hasVisFlag = true;
    } else if (args[i] === "--public") {
      isPublic = true;
      hasVisFlag = true;
    } else if (!args[i].startsWith("--")) {
      url = args[i];
    }
  }

  if (!url) {
    console.error("\n  \x1b[31m✗\x1b[0m Usage: pwahatch submit <url>\n");
    process.exit(1);
  }

  // Preview
  console.log(`\n  Crawling ${url}...`);
  let manifest;
  try {
    manifest = await crawlManifest(url);
  } catch (e) {
    console.error(`\n  \x1b[31m✗\x1b[0m ${e.message}\n`);
    process.exit(1);
  }

  console.log(`\n  \x1b[32m✓\x1b[0m Found manifest`);
  console.log(`    Name:        ${manifest.name}`);
  if (manifest.description)
    console.log(`    Description: ${manifest.description}`);
  console.log(`    Icons:       ${manifest.icons} found`);
  if (manifest.themeColor)
    console.log(`    Theme:       ${manifest.themeColor}`);
  console.log();

  // Prompt for category
  if (!category) {
    console.log("  Categories:");
    CATEGORIES.forEach((c, i) =>
      console.log(`    ${String(i + 1).padStart(2)}. ${c}`)
    );
    console.log();
    const choice = await ask("  Pick a number (enter to skip): ");
    const idx = parseInt(choice, 10);
    if (idx >= 1 && idx <= CATEGORIES.length) {
      category = CATEGORIES[idx - 1];
    }
  }

  // Prompt for visibility
  if (!hasVisFlag) {
    const vis = await ask("  Public? (Y/n): ");
    isPublic = vis.toLowerCase() !== "n";
  }

  // Submit
  console.log("\n  Submitting...");
  const baseUrl = config.baseUrl || DEFAULT_URL;
  const res = await fetch(`${baseUrl}/api/apps`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `better-auth.session_token=${config.token}`,
    },
    body: JSON.stringify({ url, category, isPublic }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`\n  \x1b[31m✗\x1b[0m ${data.error || "Submission failed"}\n`);
    process.exit(1);
  }

  console.log(
    `\n  \x1b[32m✓\x1b[0m Submitted! Install page: ${baseUrl}/${data.app.slug}\n`
  );
}

async function logout() {
  try {
    rmSync(CONFIG_FILE);
  } catch {}
  console.log("\n  \x1b[32m✓\x1b[0m Logged out\n");
}

// ── Main ────────────────────────────────────────────────

const [, , command, ...args] = process.argv;
const commands = { login, submit, logout };

if (!command || !commands[command]) {
  console.log(`
  \x1b[1mpwahatch\x1b[0m — Submit PWAs from your terminal

  \x1b[2mUsage:\x1b[0m
    pwahatch login [--url <base>]    Log in with email/password
    pwahatch submit <url>            Submit a PWA
      --category <name>              Set category (skip prompt)
      --private                      List as private
    pwahatch logout                  Clear stored session
  `);
  process.exit(command ? 1 : 0);
}

commands[command](args).catch((err) => {
  console.error(`\n  \x1b[31m✗\x1b[0m ${err.message}\n`);
  process.exit(1);
});
