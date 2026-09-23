import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { APP_RUNNING, checkLaunchPort, PORT_OCCUPIED } from "./check-launch-port.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = 5177;
const url = `http://localhost:${port}`;

function openBrowser() {
  const command = process.env.ComSpec || "cmd.exe";
  const child = spawn(command, ["/d", "/s", "/c", `start "" "${url}"`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function installDependencies() {
  if (existsSync(join(root, "node_modules"))) return;

  console.log("初回起動のため、必要なパッケージをインストールしています...");
  console.log("（次回からはすぐ起動します）\n");

  const command = process.env.ComSpec || "cmd.exe";
  const result = spawnSync(command, ["/d", "/s", "/c", "npm install"], {
    cwd: root,
    stdio: "inherit",
    windowsHide: false
  });

  if (result.status !== 0) {
    throw new Error("インストールに失敗しました。ネット接続を確認してください。");
  }
}

async function main() {
  process.chdir(root);

  console.log("\n ==========================================");
  console.log("  MTG Token Finder");
  console.log(" ==========================================\n");

  const portStatus = await checkLaunchPort({ port });
  if (portStatus === APP_RUNNING) {
    console.log("すでに MTG Token Finder が起動しています。");
    console.log(`既存の画面を開きます。${url}`);
    openBrowser();
    return;
  }
  if (portStatus === PORT_OCCUPIED) {
    throw new Error(`ポート ${port} を別のアプリが使用しています。そのアプリを終了してから、start.bat をもう一度開いてください。`);
  }

  installDependencies();
  process.env.PORT = String(port);

  console.log("サーバを起動しています...");
  console.log(`ブラウザが自動で開きます。${url}\n`);
  console.log("このウィンドウを閉じると停止します。");
  console.log("──────────────────────────────────────────\n");

  const browserTimer = setTimeout(openBrowser, 1500);
  browserTimer.unref();
  await import("../server.mjs");
}

main().catch((error) => {
  console.error(`\n[エラー] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
