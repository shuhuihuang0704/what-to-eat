CREATE TABLE `cooking_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_name` text NOT NULL,
	`note` text,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cooking_records_user_completed` ON `cooking_records` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `fridge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`quantity` text NOT NULL,
	`storage` text NOT NULL,
	`food_state` text NOT NULL,
	`state_date` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fridge_items_user_expires` ON `fridge_items` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_name` text NOT NULL,
	`caption` text NOT NULL,
	`has_photo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_works_user_created` ON `works` (`user_id`,`created_at`);