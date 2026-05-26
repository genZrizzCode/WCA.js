import { spawn } from "node:child_process";

function spawnDetached(command, args) {
  const child = spawn(command, args, { stdio: "ignore" });
  child.unref?.();
  return child;
}

async function hasCommand(cmd) {
  try {
    const child = spawn(cmd, ["--help"], { stdio: "ignore" });
    return await new Promise((resolve) => {
      child.on("error", () => resolve(false));
      child.on("exit", () => resolve(true));
    });
  } catch {
    return false;
  }
}

export async function startSleepInhibitor() {
  const platform = process.platform;

  if (platform === "darwin") {
    if (!(await hasCommand("caffeinate"))) return { ok: false, reason: "caffeinate not found" };
    const child = spawn("caffeinate", ["-dimsu", "-w", String(process.pid)], { stdio: "ignore" });
    return {
      ok: true,
      stop() {
        child.kill("SIGTERM");
      },
    };
  }

  if (platform === "linux") {
    if (!(await hasCommand("systemd-inhibit"))) return { ok: false, reason: "systemd-inhibit not found" };
    const child = spawn("systemd-inhibit", ["--what=sleep", "--why=wcajs live mode", "sleep", "infinity"], {
      stdio: "ignore",
    });
    return {
      ok: true,
      stop() {
        child.kill("SIGTERM");
      },
    };
  }

  if (platform === "win32") {
    const ps = "powershell.exe";
    if (!(await hasCommand(ps))) return { ok: false, reason: "powershell.exe not found" };
    const script = [
      'Add-Type @"',
      "using System;",
      "using System.Runtime.InteropServices;",
      "public class SleepInhibit {",
      '  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);',
      "  public const uint ES_CONTINUOUS = 0x80000000;",
      "  public const uint ES_SYSTEM_REQUIRED = 0x00000001;",
      "  public const uint ES_DISPLAY_REQUIRED = 0x00000002;",
      "}",
      '"@;',
      "[SleepInhibit]::SetThreadExecutionState([SleepInhibit]::ES_CONTINUOUS -bor [SleepInhibit]::ES_SYSTEM_REQUIRED -bor [SleepInhibit]::ES_DISPLAY_REQUIRED) | Out-Null;",
      "while ($true) { Start-Sleep -Seconds 60 }",
    ].join("\n");
    const child = spawnDetached(ps, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    return {
      ok: true,
      stop() {
        child.kill();
      },
    };
  }

  return { ok: false, reason: `unsupported platform: ${platform}` };
}

