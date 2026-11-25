import fs from "node:fs";
import type { WebViewHandle } from "@zenbu-labs/pixel";
import { bundledAsset } from "./assets";

const SCRIPT_ASSET = "darkreader/darkreader.js";
const WORLD = "terminal-browser-dark-reader";

const START_WHEN_HEAD_EXISTS = `() => {
  const start = () => DarkReader.auto({});
  if (document.head) return start();
  new MutationObserver((_, observer) => {
    if (!document.head) return;
    observer.disconnect();
    start();
  }).observe(document, { childList: true, subtree: true });
}`;

let enableSource: string | null = null;
function darkReaderEnableSource(): string {
  if (enableSource) return enableSource;
  const file = bundledAsset(SCRIPT_ASSET);
  if (!file) throw new Error(`darkreader bundle missing: assets/${SCRIPT_ASSET} (run pnpm install)`);
  enableSource = `${fs.readFileSync(file, "utf8")}\n;(${START_WHEN_HEAD_EXISTS})();`;
  return enableSource;
}

interface FrameTree {
  frame: { id: string };
  childFrames?: FrameTree[];
}

function frameIds(tree: FrameTree): string[] {
  return [tree.frame.id, ...(tree.childFrames ?? []).flatMap(frameIds)];
}

// follows the page's prefers-color-scheme, which is emulated from the terminal background
export class DarkReader {
  private scriptId: string | null = null;
  private wanted = false;
  private syncing: Promise<void> | null = null;

  constructor(private readonly view: WebViewHandle) {}

  set(enabled: boolean): void {
    this.wanted = enabled;
    if (!this.syncing) {
      this.syncing = this.sync()
        .catch(() => {})
        .finally(() => (this.syncing = null));
    }
  }

  private async sync(): Promise<void> {
    while (this.wanted !== (this.scriptId !== null)) {
      if (this.wanted) await this.install();
      else await this.uninstall();
    }
  }

  private async install(): Promise<void> {
    const { identifier } = await this.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: darkReaderEnableSource(),
      worldName: WORLD,
      runImmediately: true,
    });
    this.scriptId = identifier as string;
  }

  private async uninstall(): Promise<void> {
    const identifier = this.scriptId!;
    this.scriptId = null;
    await this.view.cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    const { frameTree } = await this.view.cdp("Page.getFrameTree");
    for (const frameId of frameIds(frameTree as FrameTree)) {
      const world = await this.view.cdp("Page.createIsolatedWorld", { frameId, worldName: WORLD }).catch(() => null);
      if (!world) continue;
      await this.view
        .cdp("Runtime.evaluate", {
          expression: "globalThis.DarkReader?.auto(false)",
          contextId: world.executionContextId,
        })
        .catch(() => {});
    }
  }
}
