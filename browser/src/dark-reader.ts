import fs from "node:fs";
import type { WebViewHandle } from "@zenbu-labs/pixel";
import { bundledAsset } from "./assets";

const WORLD = "terminal-browser-dark-reader";

const START_WHEN_HEAD_EXISTS = `() => {
  DarkReader.setFetchMethod(fetch);
  const start = () => DarkReader.auto({});
  if (document.head) return start();
  new MutationObserver((_, observer) => {
    if (!document.head) return;
    observer.disconnect();
    start();
  }).observe(document, { childList: true, subtree: true });
}`;

let source: string | null = null;
function darkReaderSource(): string {
  if (source) return source;
  const file = bundledAsset("darkreader/darkreader.js");
  if (!file) throw new Error("darkreader bundle missing from assets (run pnpm install)");
  return (source = `${fs.readFileSync(file, "utf8")}\n;(${START_WHEN_HEAD_EXISTS})();`);
}

type FrameTree = { frame: { id: string }; childFrames?: FrameTree[] };
const frameIds = (tree: FrameTree): string[] => [tree.frame.id, ...(tree.childFrames ?? []).flatMap(frameIds)];

// follows the page's prefers-color-scheme, which is emulated from the terminal background
export class DarkReader {
  private scriptId: string | null = null;
  private queue = Promise.resolve();

  constructor(private readonly view: WebViewHandle) {}

  set(enabled: boolean): void {
    this.queue = this.queue.then(() => (enabled ? this.install() : this.uninstall())).catch(() => {});
  }

  private async install(): Promise<void> {
    if (this.scriptId) return;
    const { identifier } = await this.view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: darkReaderSource(),
      worldName: WORLD,
      runImmediately: true,
    });
    this.scriptId = identifier as string;
  }

  private async uninstall(): Promise<void> {
    if (!this.scriptId) return;
    await this.view.cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.scriptId });
    this.scriptId = null;
    const { frameTree } = await this.view.cdp("Page.getFrameTree");
    for (const frameId of frameIds(frameTree as FrameTree)) {
      const { executionContextId } = await this.view.cdp("Page.createIsolatedWorld", { frameId, worldName: WORLD });
      await this.view.cdp("Runtime.evaluate", { expression: "globalThis.DarkReader?.auto(false)", contextId: executionContextId });
    }
  }
}
