import net from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PORT_FREE = 0;
export const APP_RUNNING = 10;
export const PORT_OCCUPIED = 11;

const EXPECTED_FORMATS = ["standard", "pioneer", "modern", "legacy"];

function tcpPortIsOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (isOpen) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(isOpen);
    };

    socket.setTimeout(timeoutMs, () => finish(true));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function isMtgTokenFinder(host, port, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`http://${host}:${port}/api/formats`, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return false;

    const formats = await response.json();
    return Array.isArray(formats) && EXPECTED_FORMATS.every((key) => formats.some((item) => item?.key === key));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkLaunchPort({ host = "127.0.0.1", port = 5177, timeoutMs = 1200 } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("port must be an integer between 1 and 65535");
  }

  if (await isMtgTokenFinder(host, port, timeoutMs)) return APP_RUNNING;
  return (await tcpPortIsOpen(host, port, timeoutMs)) ? PORT_OCCUPIED : PORT_FREE;
}

async function main() {
  const port = Number(process.argv[2] ?? 5177);
  const status = await checkLaunchPort({ port });
  process.exitCode = status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
