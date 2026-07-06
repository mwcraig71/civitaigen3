import { Pool, neonConfig } from '@neondatabase/serverless';
import { logger } from "./logger";
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from "@shared/schema";
import ws from 'ws';

// Configure WebSocket constructor for Neon database
// This is required for Node.js environments
neonConfig.webSocketConstructor = ws;
neonConfig.fetchConnectionCache = true;
neonConfig.pipelineConnect = false;

logger.info('WebSocket constructor configured successfully for Neon database');

// Use CUSTOM_DATABASE_URL if available (prevents Replit from overwriting), otherwise fall back to DATABASE_URL
const databaseUrl = process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL or CUSTOM_DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
