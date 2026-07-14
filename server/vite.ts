import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Replit's proxy doesn't support WebSocket upgrades, so the HMR client in the
  // browser can never connect. This causes a polling loop (WS fails → ping succeeds
  // → full page reload → repeat) that keeps interrupting the app.
  // Setting hmr: false stops Vite from injecting @vite/client entirely, so the
  // browser never polls. We keep fastRefresh:true (default) so the React preamble
  // IS still injected via transformIndexHtml — component preamble checks still pass.
  const serverOptions = {
    middlewareMode: true,
    hmr: false as const,
    // hmr:false alone is NOT enough — Vite still opens its HMR WebSocket
    // server on port 24678 unless ws:false is also set. That listener answers
    // the HMR client's ping with HTTP 426, which the client interprets as
    // "server is back up" → full page reload → infinite reload loop.
    ws: false as const,
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Serve a stub for /@vite/client BEFORE vite.middlewares. Even with hmr:false,
  // transformed modules (e.g. CSS) import createHotContext/updateStyle from
  // "/@vite/client" — loading the real client starts its WebSocket + poll/reload
  // loop, which fails through Replit's proxy and keeps reloading the page.
  // The stub implements the style-injection API (required for CSS to work in dev)
  // and no-ops all HMR behavior.
  const viteClientStub = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function injectQuery(url) { return url; }
export function createHotContext() {
  return {
    get data() { return {}; },
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export class ErrorOverlay {}
`;
  app.get("/@vite/client", (_req, res) => {
    res
      .status(200)
      .set({ "Content-Type": "text/javascript", "Cache-Control": "no-store" })
      .end(viteClientStub);
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      let page = await vite.transformIndexHtml(url, template);
      // Belt-and-suspenders: remove any injected @vite/client script. Replit's
      // proxy can't sustain the HMR WebSocket in all browsers, and the client's
      // fallback (poll → full page reload) keeps interrupting the app load.
      page = page.replace(
        /<script[^>]*src="[^"]*\/@vite\/client"[^>]*><\/script>\s*/g,
        "",
      );
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
