import { storage } from "./storage";
import { logger } from "./logger";

/**
 * Single admin-gate middleware for all /api/admin routes.
 * Verifies the session is authenticated AND the user has isAdmin in the DB.
 * Sets req.adminUser for downstream handlers.
 */
export const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    if (!req.isAuthenticated?.() || !req.user?.claims?.sub) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userId = (req.user as any).claims.sub;
    const user = await storage.getUser(userId);

    if (!user?.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.adminUser = user;
    next();
  } catch (error) {
    logger.error("Admin check error:", error);
    res.status(500).json({ error: "Failed to verify admin status" });
  }
};
