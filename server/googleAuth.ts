import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { logger } from "./logger";

/**
 * Google-only authentication (replaces the previous Replit OIDC setup).
 *
 * The session user object keeps the exact same shape the rest of the app
 * expects — `req.user.claims.sub` etc. — so no route changes are needed:
 *   { claims: { sub, email, first_name, last_name, profile_image_url }, expires_at }
 *
 * Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 * APP_DOMAINS: comma-separated domains whose /api/auth/google/callback URLs
 * are registered in the Google Cloud console.
 *
 * Note: the platform's own API (server/api-v1.ts) authenticates with Bearer
 * API keys and is completely independent of this session auth.
 */

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL("https://accounts.google.com"),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const pgStore = connectPg(session);
  const databaseUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
  const sessionStore = new pgStore({
    conString: databaseUrl,
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS,
    },
  });
}

async function upsertUser(claims: any) {
  try {
    await storage.upsertUser({
      id: claims["sub"],
      email: claims["email"],
      firstName: claims["given_name"],
      lastName: claims["family_name"],
      profileImageUrl: claims["picture"],
    });

    // Record provider metadata (columns already exist from the earlier
    // Google-migration groundwork)
    try {
      await storage.updateUser(claims["sub"], {
        authProvider: "google",
        googleSub: claims["sub"],
        emailVerified: claims["email_verified"] === true,
        lastLoginAt: new Date(),
      } as any);
    } catch {
      // Metadata update is best-effort
    }

    // Automatically grant admin privileges to mwcraig71
    const email = claims["email"];
    if (email && email.toLowerCase().startsWith("mwcraig71@")) {
      const user = await storage.getUser(claims["sub"]);
      if (user && !user.isAdmin) {
        await storage.updateUser(claims["sub"], { isAdmin: true });
        logger.info("✅ Admin privileges automatically granted to mwcraig71");
      }
    }
  } catch (error: any) {
    if (
      error.message?.includes("signups are currently disabled") ||
      error.message?.includes("email address is not allowed")
    ) {
      logger.info(`🚫 OAuth signup blocked: ${error.message} for email: ${claims["email"]}`);
      throw new Error("SIGNUP_BLOCKED: " + error.message);
    }
    throw error;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    try {
      const claims = tokens.claims();
      if (!claims) {
        verified(new Error("No claims in token response"), false);
        return;
      }
      await upsertUser(claims);
      // Same session shape the whole app relies on
      const sessionUser = {
        claims: {
          sub: claims.sub,
          email: claims.email,
          first_name: (claims as any).given_name ?? "",
          last_name: (claims as any).family_name ?? "",
          profile_image_url: (claims as any).picture ?? null,
        },
        expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000,
      };
      verified(null, sessionUser);
    } catch (error: any) {
      if (error.message?.startsWith("SIGNUP_BLOCKED:")) {
        verified(new Error("New user registrations are currently disabled. Please try again later."), false);
        return;
      }
      logger.error("Authentication error:", error);
      verified(error, false);
    }
  };

  // One strategy per domain (each callback URL must be registered in the
  // Google Cloud console under the OAuth client's authorized redirect URIs).
  const domains = (process.env.APP_DOMAINS || "civiverse.com,www.civiverse.com")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") {
    domains.push(`localhost:${process.env.PORT || 5000}`);
  }

  const registeredStrategies = new Set<string>();
  for (const domain of domains) {
    const isLocal = domain.startsWith("localhost");
    const strategy = new Strategy(
      {
        name: `google:${domain.split(":")[0] === "localhost" ? "localhost" : domain}`,
        config,
        scope: "openid email profile",
        callbackURL: `${isLocal ? "http" : "https"}://${domain}/api/callback`,
      },
      verify
    );
    passport.use(strategy);
    registeredStrategies.add(domain.split(":")[0] === "localhost" ? "localhost" : domain);
    logger.info(`✅ Registered Google auth for domain: ${domain}`);
  }
  const fallbackStrategy = `google:${Array.from(registeredStrategies)[0]}`;

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const strategyFor = (hostname: string) =>
    registeredStrategies.has(hostname) ? `google:${hostname}` : fallbackStrategy;

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(strategyFor(req.hostname), {
      prompt: "select_account",
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(strategyFor(req.hostname), {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session?.destroy(() => {
        res.redirect("/");
      });
    });
  });

  // Demo login endpoint - bypasses OAuth for demo user (unchanged behavior)
  app.post("/api/demo-login", async (req, res) => {
    try {
      const demoUser = await storage.getUser("demo_user_fixed_id");
      if (!demoUser) {
        return res.status(500).json({ message: "Demo user not found" });
      }
      const mockUser = {
        claims: {
          sub: "demo_user_fixed_id",
          email: "demo@civiverse.com",
          first_name: "Demo",
          last_name: "User",
          profile_image_url: null,
        },
        expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };
      req.login(mockUser, (err) => {
        if (err) {
          logger.error("Demo login error:", err);
          return res.status(500).json({ message: "Failed to create demo session" });
        }
        res.json({
          success: true,
          message: "Demo session created",
          user: { id: demoUser.id, username: demoUser.username, buzzCredits: demoUser.buzzCredits },
        });
      });
    } catch (error) {
      logger.error("Demo login error:", error);
      res.status(500).json({ message: "Failed to create demo session" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if user account is locked
  try {
    const userRecord = await storage.getUser(user.claims.sub);
    if (userRecord?.isLocked) {
      return res.status(403).json({
        message: "Account locked",
        reason: userRecord.lockReason || "Account has been suspended by an administrator",
        lockedAt: userRecord.lockedAt,
      });
    }
  } catch (error) {
    logger.error("Error checking user lock status:", error);
    // Don't block if we can't check lock status
  }

  // Google tokens aren't used after login — session lifetime is the only clock.
  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};
