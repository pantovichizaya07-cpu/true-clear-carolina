CREATE TABLE "blocked_days" (
	"date" date PRIMARY KEY,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY,
	"ref" text NOT NULL UNIQUE,
	"access_token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"town" text NOT NULL,
	"service" text NOT NULL,
	"stories" integer DEFAULT 1 NOT NULL,
	"windows" integer NOT NULL,
	"screens" integer DEFAULT 0 NOT NULL,
	"first_clean" integer DEFAULT 1 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"slot" text NOT NULL,
	"estimate_cents" integer NOT NULL,
	"final_price_cents" integer,
	"flags" text DEFAULT '' NOT NULL,
	"customer_message" text DEFAULT '' NOT NULL,
	"admin_notes" text DEFAULT '' NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_live_slot_idx" ON "bookings" ("date","slot") WHERE status in ('pending', 'confirmed');--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" ("status");