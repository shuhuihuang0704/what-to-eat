import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar"),
    cookingLevel: text("cooking_level"),
    profileCompletedAt: integer("profile_completed_at"),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull().default(100000),
    emailVerifiedAt: integer("email_verified_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)]
);

export const verificationCodes = sqliteTable(
  "verification_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    purpose: text("purpose").notNull().default("register"),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_verification_codes_email_purpose_created").on(
      table.email,
      table.purpose,
      table.createdAt
    ),
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_sessions_user_id").on(table.userId),
    index("idx_sessions_expires_at").on(table.expiresAt),
  ]
);

export const fridgeItems = sqliteTable(
  "fridge_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    quantity: text("quantity").notNull(),
    storage: text("storage").notNull(),
    foodState: text("food_state").notNull(),
    stateDate: integer("state_date").notNull(),
    expiresAt: integer("expires_at").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_fridge_items_user_expires").on(table.userId, table.expiresAt)]
);

export const cookingRecords = sqliteTable(
  "cooking_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    recipeName: text("recipe_name").notNull(),
    note: text("note"),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [index("idx_cooking_records_user_completed").on(table.userId, table.completedAt)]
);

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    recipeName: text("recipe_name").notNull(),
    caption: text("caption").notNull(),
    hasPhoto: integer("has_photo", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_works_user_created").on(table.userId, table.createdAt)]
);
