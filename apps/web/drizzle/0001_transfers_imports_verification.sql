CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'mapping', 'validating', 'ready', 'importing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transfer_reason" AS ENUM('resale', 'gift', 'warranty_claim', 'repair_exchange', 'take_back', 'recycling', 'brand_acquisition', 'licensing', 'other');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('initiated', 'accepted', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."verification_level" AS ENUM('unverified', 'email_confirmed', 'domain_verified', 'document_verified', 'qualified_seal');--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"filename" varchar(512) NOT NULL,
	"source" varchar(16) DEFAULT 'csv' NOT NULL,
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rows" jsonb,
	"results" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"succeeded_rows" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passport_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"from_tenant_id" uuid NOT NULL,
	"to_tenant_id" uuid,
	"to_email" varchar(320),
	"reason" "transfer_reason" NOT NULL,
	"status" "transfer_status" DEFAULT 'initiated' NOT NULL,
	"note" text,
	"accept_token_hash" char(66),
	"expires_at" timestamp with time zone,
	"initiated_by" uuid NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"rejection_reason" text,
	"transfer_credential" jsonb,
	"acceptance_credential" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"level" "verification_level" DEFAULT 'unverified' NOT NULL,
	"method" varchar(64) NOT NULL,
	"evidence" jsonb,
	"challenge" varchar(255),
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "passports" ADD COLUMN "owner_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_transfers" ADD CONSTRAINT "passport_transfers_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_transfers" ADD CONSTRAINT "passport_transfers_from_tenant_id_tenants_id_fk" FOREIGN KEY ("from_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_transfers" ADD CONSTRAINT "passport_transfers_to_tenant_id_tenants_id_fk" FOREIGN KEY ("to_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_transfers" ADD CONSTRAINT "passport_transfers_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_transfers" ADD CONSTRAINT "passport_transfers_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_import_jobs_tenant" ON "import_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transfers_passport" ON "passport_transfers" USING btree ("passport_id");--> statement-breakpoint
CREATE INDEX "idx_transfers_from" ON "passport_transfers" USING btree ("from_tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_transfers_to" ON "passport_transfers" USING btree ("to_tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_verifications_subject" ON "verifications" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_verifications_tenant" ON "verifications" USING btree ("tenant_id","level");--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_owner_tenant_id_tenants_id_fk" FOREIGN KEY ("owner_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;