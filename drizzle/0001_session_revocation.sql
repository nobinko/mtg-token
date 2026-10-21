CREATE TABLE `revoked_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_revoked_sessions_expiry` ON `revoked_sessions` (`expires_at`);