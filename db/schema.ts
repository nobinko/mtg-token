import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("idx_login_attempts_expiry").on(table.expiresAt)]);

export const revokedSessions = sqliteTable("revoked_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("idx_revoked_sessions_expiry").on(table.expiresAt)]);
