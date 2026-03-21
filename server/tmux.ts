import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_TMUX_CAPTURE_LINES = 200;

export async function captureTmuxOutput(
  session: string,
  lines = DEFAULT_TMUX_CAPTURE_LINES,
) {
  const safeLines = Math.max(1, Math.floor(lines));
  const { stdout } = await execFileAsync(
    "tmux",
    ["capture-pane", "-p", "-t", session, "-S", `-${safeLines}`],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    },
  );

  return stdout.trimEnd();
}
