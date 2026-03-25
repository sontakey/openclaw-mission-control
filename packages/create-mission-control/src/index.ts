#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const REPO_URL = "https://github.com/sontakey/openclaw-mission-control.git";
const DEFAULT_PORT = 3100;
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:18789";
const SERVICE_NAME = "mission-control";

// Colors
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function log(msg: string) { console.log(msg); }
function step(msg: string) { log(`\n${green("▸")} ${bold(msg)}`); }
function info(msg: string) { log(`  ${dim(msg)}`); }
function error(msg: string) { log(`${red("✗")} ${msg}`); }
function success(msg: string) { log(`${green("✓")} ${msg}`); }

function run(cmd: string, opts: { cwd?: string; silent?: boolean } = {}) {
  try {
    return execSync(cmd, {
      cwd: opts.cwd,
      stdio: opts.silent ? "pipe" : "inherit",
      encoding: "utf-8",
    });
  } catch (e) {
    return null;
  }
}

function commandExists(cmd: string): boolean {
  return spawnSync("which", [cmd], { stdio: "pipe" }).status === 0;
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function detectGatewayToken(): string | null {
  // Try common locations for the gateway auth token
  const locations = [
    join(process.env.HOME || "", ".openclaw", ".env"),
    "/etc/default/openclaw",
  ];

  for (const loc of locations) {
    try {
      if (!existsSync(loc)) continue;
      const content = readFileSync(loc, "utf-8");
      const match = content.match(/GATEWAY_AUTH_TOKEN=(\S+)/);
      if (match?.[1]) return match[1];
    } catch { /* ignore */ }
  }

  // Try reading from OpenClaw config
  const configPath = join(process.env.HOME || "", ".openclaw", "openclaw.json");
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      // Look for gateway.auth.token that isn't a variable reference
      const tokenMatch = raw.match(/"token":\s*"([^$][^"]+)"/);
      if (tokenMatch?.[1] && !tokenMatch[1].startsWith("__OPENCLAW")) {
        return tokenMatch[1];
      }
    }
  } catch { /* ignore */ }

  return null;
}

function detectGatewayUrl(): string | null {
  const configPath = join(process.env.HOME || "", ".openclaw", "openclaw.json");
  try {
    if (!existsSync(configPath)) return null;
    const raw = readFileSync(configPath, "utf-8");
    const portMatch = raw.match(/"port":\s*(\d+)/);
    if (portMatch?.[1]) {
      return `http://127.0.0.1:${portMatch[1]}`;
    }
  } catch { /* ignore */ }
  return null;
}

async function main() {
  log("");
  log(bold("  🎛️  Mission Control — OpenClaw Agent Dashboard"));
  log(dim("  One-command setup for your agent fleet dashboard"));
  log("");

  // Check prerequisites
  step("Checking prerequisites");

  const missing: string[] = [];
  if (!commandExists("node")) missing.push("node");
  if (!commandExists("npm")) missing.push("npm");
  if (!commandExists("git")) missing.push("git");

  if (missing.length > 0) {
    error(`Missing required tools: ${missing.join(", ")}`);
    process.exit(1);
  }

  const nodeVersion = run("node --version", { silent: true })?.trim() || "";
  info(`node ${nodeVersion}`);

  // Check if OpenClaw is installed
  const hasOpenclaw = commandExists("openclaw");
  if (hasOpenclaw) {
    success("OpenClaw detected");
  } else {
    info("OpenClaw not detected on this machine (dashboard can still connect to a remote gateway)");
  }

  // Determine install directory
  step("Configuration");

  const args = process.argv.slice(2);
  const targetDir = args[0] || await prompt("Install directory", "./mission-control");
  const installDir = resolve(targetDir);
  info(`Directory: ${installDir}`);

  // Detect or ask for gateway URL
  const detectedUrl = detectGatewayUrl();
  const gatewayUrl = await prompt(
    "OpenClaw gateway URL",
    detectedUrl || DEFAULT_GATEWAY_URL
  );

  // Detect or ask for token
  const detectedToken = detectGatewayToken();
  let token: string;
  if (detectedToken) {
    info(`Auto-detected gateway token: ${detectedToken.slice(0, 8)}...`);
    const useDetected = await prompt("Use detected token? (y/n)", "y");
    token = useDetected.toLowerCase() === "n"
      ? await prompt("Gateway auth token")
      : detectedToken;
  } else {
    log("");
    info("To find your gateway token, check:");
    info("  grep GATEWAY_AUTH_TOKEN ~/.openclaw/.env");
    info("  or check your OpenClaw config: gateway.auth.token");
    log("");
    token = await prompt("Gateway auth token");
  }

  if (!token) {
    error("Gateway token is required. The dashboard needs it to talk to your OpenClaw instance.");
    process.exit(1);
  }

  const port = await prompt("Dashboard port", String(DEFAULT_PORT));

  // Clone or update repo
  step("Installing Mission Control");

  if (existsSync(join(installDir, ".git"))) {
    info("Existing installation found, pulling latest...");
    run("git pull --ff-only", { cwd: installDir });
  } else if (existsSync(installDir)) {
    error(`Directory ${installDir} exists but is not a git repo.`);
    process.exit(1);
  } else {
    info("Cloning repository...");
    run(`git clone ${REPO_URL} "${installDir}"`);
  }

  if (!existsSync(join(installDir, "package.json"))) {
    error("Clone failed — package.json not found");
    process.exit(1);
  }

  // Install dependencies
  step("Installing dependencies");
  run("npm install --production=false", { cwd: installDir });

  // Build
  step("Building");
  run("npm run build", { cwd: installDir });

  if (!existsSync(join(installDir, "dist", "client", "index.html"))) {
    error("Build failed — dist/client/index.html not found");
    process.exit(1);
  }
  success("Build complete");

  // Create .env
  step("Writing configuration");
  const envContent = [
    `PORT=${port}`,
    `OPENCLAW_GATEWAY_URL=${gatewayUrl}`,
    `OPENCLAW_TOKEN=${token}`,
    `DATABASE_FILE=mission-control.db`,
  ].join("\n") + "\n";

  writeFileSync(join(installDir, ".env"), envContent);
  success(`.env written`);

  // Set up systemd (Linux only)
  const isLinux = process.platform === "linux";
  const hasSystemd = isLinux && commandExists("systemctl");

  if (hasSystemd) {
    step("Setting up systemd service");

    const nodeBin = run("which node", { silent: true })?.trim() || "/usr/bin/node";
    const user = process.env.USER || "ubuntu";

    const serviceContent = `[Unit]
Description=Mission Control — OpenClaw Agent Dashboard
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${installDir}
ExecStart=${nodeBin} dist/server/server/index.js
Restart=always
RestartSec=5
EnvironmentFile=${installDir}/.env

[Install]
WantedBy=multi-user.target
`;

    const servicePath = `/etc/systemd/system/${SERVICE_NAME}.service`;

    // Check if we can write to systemd
    const canSudo = run("sudo -n true 2>/dev/null", { silent: true }) !== null;

    if (canSudo) {
      writeFileSync("/tmp/mission-control.service", serviceContent);
      run(`sudo mv /tmp/mission-control.service ${servicePath}`);
      run("sudo systemctl daemon-reload");
      run(`sudo systemctl enable --now ${SERVICE_NAME}`);
      success(`Service installed and started`);
    } else {
      info("No passwordless sudo — skipping systemd setup.");
      info("To set up manually:");
      info(`  sudo tee ${servicePath} << 'EOF'`);
      info(serviceContent);
      info("  EOF");
      info("  sudo systemctl daemon-reload");
      info(`  sudo systemctl enable --now ${SERVICE_NAME}`);
    }
  }

  // Final output
  log("");
  log(green("━".repeat(50)));
  log("");
  log(bold("  🎛️  Mission Control is ready!"));
  log("");
  log(`  ${cyan("Local:")}     http://localhost:${port}`);

  // Try to detect Tailscale hostname
  const tsHostname = run("tailscale status --self --json 2>/dev/null", { silent: true });
  if (tsHostname) {
    try {
      const tsData = JSON.parse(tsHostname);
      const dnsName = tsData?.Self?.DNSName?.replace(/\.$/, "");
      if (dnsName) {
        log(`  ${cyan("Tailscale:")}  http://${dnsName}:${port}`);
      }
    } catch { /* ignore */ }
  }

  log("");
  log(`  ${dim("Gateway:")}   ${gatewayUrl}`);
  log(`  ${dim("Database:")}  ${installDir}/mission-control.db`);
  log(`  ${dim("Config:")}    ${installDir}/.env`);
  log("");

  if (!hasSystemd) {
    log(`  To start manually:`);
    log(`  ${dim(`cd ${installDir} && node dist/server/server/index.js`)}`);
    log("");
  }

  log(`  To update: ${dim(`cd ${installDir} && git pull && npm install && npm run build`)}`);
  if (hasSystemd) {
    log(`             ${dim(`sudo systemctl restart ${SERVICE_NAME}`)}`);
  }
  log("");
}

main().catch((err) => {
  error(String(err));
  process.exit(1);
});
