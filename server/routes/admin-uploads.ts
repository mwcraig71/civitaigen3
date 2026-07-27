import type { Express } from "express";
import { logger } from "../logger";
import { requireAdmin } from "../middleware";
import { storage } from "../storage";
import { ObjectStorageService, objectStorageClient, parseObjectPath } from "../objectStorage";
import type { RouteContext } from "./context";

export function registerAdminUploadsRoutes(app: Express, _ctx: RouteContext) {
  // List source uploads with pagination
  app.get("/api/admin/source-uploads", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || "50"), 10), 100);
      const offset = parseInt(String(req.query.offset || "0"), 10);
      const { uploads, total } = await storage.getSourceUploadsPaginated(limit, offset);
      res.json({ uploads, total, limit, offset });
    } catch (error) {
      logger.error("❌ Failed to list source uploads:", error);
      res.status(500).json({ message: "Failed to list source uploads" });
    }
  });

  // Get a fresh signed read URL for a source upload (view / download)
  app.get("/api/admin/source-uploads/:id/url", requireAdmin, async (req, res) => {
    try {
      const upload = await storage.getSourceUpload(req.params.id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });
      const svc = new ObjectStorageService();
      const url = await svc.getSignedReadUrl(upload.objectPath, 3600);
      res.json({ url, objectPath: upload.objectPath });
    } catch (error) {
      logger.error("❌ Failed to mint signed URL for source upload:", error);
      res.status(500).json({ message: "Failed to generate download URL" });
    }
  });

  // Delete a source upload (DB row + object storage file)
  app.delete("/api/admin/source-uploads/:id", requireAdmin, async (req, res) => {
    try {
      const upload = await storage.getSourceUpload(req.params.id);
      if (!upload) return res.status(404).json({ message: "Upload not found" });

      // Delete from object storage first (best-effort)
      try {
        const { bucketName, objectName } = parseObjectPath(upload.objectPath);
        const file = objectStorageClient.bucket(bucketName).file(objectName);
        const [exists] = await file.exists();
        if (exists) await file.delete();
        logger.info(`🗑️ Deleted source upload file: ${upload.objectPath}`);
      } catch (e) {
        logger.warn(`⚠️ Could not delete object storage file ${upload.objectPath}:`, e);
      }

      await storage.deleteSourceUpload(upload.id);
      res.json({ success: true });
    } catch (error) {
      logger.error("❌ Failed to delete source upload:", error);
      res.status(500).json({ message: "Failed to delete upload" });
    }
  });
}
