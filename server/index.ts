import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { logger } from "./logger";
import { db, pool } from "./db";

const app = express();

// Enable gzip compression for all responses
app.use(compression({
  // Compress responses larger than 1kb
  threshold: 1024,
  // Use highest compression level for better transfer speeds
  level: 9,
  // Only compress text-based content types
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Security headers. CSP is disabled for now because the SPA loads external
// images/scripts; tighten with an explicit policy as a follow-up.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS: same-origin by default; extra origins via ALLOWED_ORIGINS (comma-separated).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin/non-browser requests (no Origin header) and allowlisted origins.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Rate limiting
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // per IP per minute across the API
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // login attempts per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later." },
});
const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30, // generation requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many generation requests, slow down." },
});
app.use("/api", globalApiLimiter);
app.use(["/api/login", "/api/demo-login", "/api/callback"], authLimiter);
app.use(["/api/generations", "/api/story/generate", "/api/generate-prompts"], generationLimiter);

// Add cache headers for better performance
app.use((req, res, next) => {
  // Set cache headers based on request type
  if (req.path.startsWith('/api/')) {
    // API responses are per-user and must never be stored by shared caches.
    res.set({
      'Cache-Control': 'no-store',
    });
  } else if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    // Static assets: long cache with versioning
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
      'Expires': new Date(Date.now() + 31536000000).toUTCString(),
    });
  } else {
    // HTML and other dynamic content: short cache
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes cache
    });
  }
  
  next();
});

// Increase body size limit to handle base64 images for img2img generation
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Method/path/status only — response bodies can contain prompts,
      // tokens, and other user data and must not hit the logs.
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Apply any schema columns that may be missing in production.
  // Uses IF NOT EXISTS so it is always safe to run on startup.
  try {
    logger.info("Checking database schema...");
    await pool.query(`ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "lora_category" text`);
    // Drop the base-model-level unique constraint so multiple versions of the same
    // model can coexist. Deduplication now uses the ARN (which encodes version ID).
    await pool.query(`
      ALTER TABLE "models" DROP CONSTRAINT IF EXISTS "models_civitai_id_unique"
    `);
    // Migrate the ARN uniqueness guarantee from ("arn") to (lower("arn")).
    //
    // ORDER MATTERS. A prior deploy created "idx_models_arn_unique" over the raw
    // column. CREATE UNIQUE INDEX IF NOT EXISTS matches by NAME, not definition,
    // so recreating it as an expression index without dropping first is a silent
    // no-op — the old raw-column index survives and case-variant duplicates stay
    // possible. Drop it explicitly, then normalize, then rebuild.
    // Anything unguarded in this block reaches the outer catch, which calls
    // process.exit(1) — so the ARN index migration is guarded end to end. Worst
    // case it logs and skips; the app still starts.
    try {
      await pool.query(`DROP INDEX IF EXISTS "idx_models_arn_unique"`);
    } catch (dropErr) {
      logger.warn("⚠️ Could not drop idx_models_arn_unique (non-fatal):", dropErr);
    }

    // Normalize legacy ARN casing. AIR URNs are lowercase by spec and the import
    // path lowercases on write, so a mixed-case legacy row would otherwise escape
    // both the dedup lookup and the unique index. Guarded independently: if two
    // rows collide once folded to lowercase, this UPDATE raises a unique
    // violation, and an unguarded failure here would abort the whole schema check.
    try {
      const norm = await pool.query(`
        UPDATE "models" SET "arn" = lower("arn")
        WHERE "arn" IS NOT NULL AND "arn" <> lower("arn")
      `);
      if (norm.rowCount) logger.info(`🔧 Lowercased ${norm.rowCount} legacy ARN(s)`);
    } catch (normErr) {
      logger.warn("⚠️ Could not normalize ARN casing (non-fatal):", normErr);
    }

    // Add a partial unique index on lower(arn) (NULL arns are excluded so legacy
    // rows without an ARN don't conflict with each other).
    // Guard: if there are somehow duplicate non-null ARNs in an existing database,
    // log them and skip index creation rather than crashing the server.
    try {
      const dupeCheck = await pool.query(`
        SELECT lower("arn") AS arn, COUNT(*) AS cnt
        FROM "models"
        WHERE "arn" IS NOT NULL
        GROUP BY lower("arn")
        HAVING COUNT(*) > 1
      `);
      if (dupeCheck.rows.length > 0) {
        logger.warn(
          `⚠️ Skipping idx_models_arn_unique — found ${dupeCheck.rows.length} duplicate ARN(s): ` +
          dupeCheck.rows.map((r: any) => `${r.arn} (${r.cnt}×)`).join(", ")
        );
      } else {
        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "idx_models_arn_unique"
            ON "models" (lower("arn"))
            WHERE "arn" IS NOT NULL
        `);
      }
    } catch (idxErr) {
      logger.warn("⚠️ Could not create idx_models_arn_unique (non-fatal):", idxErr);
    }
    logger.info("Database schema check complete.");
  } catch (err) {
    logger.error("Database schema check failed:", err);
    process.exit(1);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Unhandled request error:", err);
    res.status(status).json({ message });
    // Do not rethrow: rethrowing after responding crashes the process.
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
