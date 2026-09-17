CREATE TYPE "public"."access_tier" AS ENUM('public', 'consumer', 'retailer', 'repairer', 'recycler', 'authority');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('active', 'expired', 'revoked', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('draft', 'sent', 'in_progress', 'submitted', 'under_review', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lifecycle_event" AS ENUM('manufactured', 'placed_on_market', 'sold', 'registered_by_owner', 'repaired', 'refurbished', 'altered', 'resold', 'rented', 'returned', 'donated', 'collected', 'sorted', 'recycled', 'incinerated', 'landfilled', 'lost');--> statement-breakpoint
CREATE TYPE "public"."partner_role" AS ENUM('brand', 'importer', 'authorised_representative', 'manufacturer', 'cut_make_trim', 'weaving', 'knitting', 'dyeing', 'printing', 'finishing', 'tanning', 'spinning', 'ginning', 'farm', 'fibre_producer', 'trim_supplier', 'logistics', 'retailer', 'repairer', 'recycler', 'certifier', 'laboratory');--> statement-breakpoint
CREATE TYPE "public"."passport_scope" AS ENUM('model', 'batch', 'item');--> statement-breakpoint
CREATE TYPE "public"."passport_status" AS ENUM('draft', 'in_review', 'changes_requested', 'approved', 'published', 'suspended', 'recalled', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('PLATFORM_ADMIN', 'BRAND_ADMIN', 'PRODUCT_MANAGER', 'COMPLIANCE_OFFICER', 'SUPPLIER', 'CERTIFIER', 'REPAIRER', 'RECYCLER', 'AUTHORITY');--> statement-breakpoint
CREATE TYPE "public"."supply_tier" AS ENUM('tier_0_retail', 'tier_1_assembly', 'tier_2_material', 'tier_3_processing', 'tier_4_raw_material');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('onboarding', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"tier" "access_tier" NOT NULL,
	"channel" varchar(16) NOT NULL,
	"country_code" char(2),
	"device_class" varchar(16),
	"locale" varchar(10),
	"referrer_host" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"key_hash" char(66) NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"previous_hash" char(66) NOT NULL,
	"entry_hash" char(66) NOT NULL,
	"actor_id" uuid,
	"actor_label" varchar(255) NOT NULL,
	"action" varchar(64) NOT NULL,
	"subject_type" varchar(64) NOT NULL,
	"subject_id" varchar(128) NOT NULL,
	"metadata" jsonb,
	"ip" varchar(64),
	"user_agent" varchar(512),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_audit_tenant_sequence" UNIQUE("tenant_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"passport_id" uuid,
	"partner_id" uuid,
	"scheme" varchar(64) NOT NULL,
	"credential_type" varchar(128) NOT NULL,
	"licence_number" varchar(128),
	"scope_description" text,
	"issuer_name" varchar(255) NOT NULL,
	"issuer_did" varchar(512),
	"subject_did" varchar(512),
	"document" jsonb NOT NULL,
	"document_hash" char(66) NOT NULL,
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"status_list_index" integer,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_request_passports" (
	"data_request_id" uuid NOT NULL,
	"passport_id" uuid NOT NULL,
	CONSTRAINT "data_request_passports_data_request_id_passport_id_pk" PRIMARY KEY("data_request_id","passport_id")
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"partner_id" uuid,
	"title" varchar(255) NOT NULL,
	"message" text,
	"requested_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "data_request_status" DEFAULT 'draft' NOT NULL,
	"access_token_hash" char(66),
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_notes" text,
	"submission" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"passport_id" uuid,
	"data_request_id" uuid,
	"filename" varchar(512) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_hash" char(66) NOT NULL,
	"storage_key" varchar(1024) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"visibility" "access_tier" DEFAULT 'authority' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" "role" NOT NULL,
	"token_hash" char(66) NOT NULL,
	"invited_by" uuid,
	"message" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"href" varchar(2048),
	"severity" varchar(16) DEFAULT 'info' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"tier" "supply_tier" NOT NULL,
	"roles" "partner_role"[] DEFAULT '{}' NOT NULL,
	"country" char(2) NOT NULL,
	"address" jsonb,
	"latitude" varchar(24),
	"longitude" varchar(24),
	"os_id" varchar(32),
	"gln" char(13),
	"lei" char(20),
	"did" varchar(512),
	"contact_name" varchar(255),
	"contact_email" varchar(320),
	"worker_count" integer,
	"capabilities" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passport_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"event_type" "lifecycle_event" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"partner_id" uuid,
	"actor_id" uuid,
	"location" jsonb,
	"summary" varchar(512),
	"details" jsonb,
	"visibility" "access_tier" DEFAULT 'public' NOT NULL,
	"evidence_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passport_partners" (
	"passport_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"role" "partner_role" NOT NULL,
	"tier" "supply_tier" NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"component_ref" varchar(128),
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passport_partners_passport_id_partner_id_role_pk" PRIMARY KEY("passport_id","partner_id","role")
);
--> statement-breakpoint
CREATE TABLE "passport_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"from_status" "passport_status",
	"to_status" "passport_status" NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passport_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"data_hash" char(66) NOT NULL,
	"credential_hash" char(66),
	"change_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_passport_versions_version" UNIQUE("passport_id","version")
);
--> statement-breakpoint
CREATE TABLE "passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid,
	"dpp_id" varchar(32) NOT NULL,
	"scope" "passport_scope" DEFAULT 'model' NOT NULL,
	"gtin" varchar(14),
	"serial_number" varchar(64),
	"batch_number" varchar(64),
	"sku" varchar(128),
	"colour_name" varchar(128),
	"colour_code" varchar(64),
	"size" varchar(32),
	"size_system" varchar(16),
	"status" "passport_status" DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"published_version" integer,
	"completeness" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"placed_on_market_at" timestamp with time zone,
	"recall_reason" text,
	"recall_severity" varchar(16),
	"recall_instructions" text,
	"recalled_at" timestamp with time zone,
	"registry_id" varchar(255),
	"registry_url" varchar(2048),
	"registry_submitted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "passports_dpp_id_unique" UNIQUE("dpp_id"),
	CONSTRAINT "uq_passports_gtin_serial" UNIQUE("gtin","serial_number")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"style_number" varchar(128),
	"category" varchar(128) NOT NULL,
	"hs_code" varchar(16),
	"season" varchar(32),
	"target_market" varchar(32),
	"description" text,
	"hero_image_url" varchar(2048),
	"baseline" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "uq_products_tenant_style" UNIQUE("tenant_id","style_number")
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"did" varchar(512) NOT NULL,
	"key_id" varchar(512) NOT NULL,
	"algorithm" varchar(16) DEFAULT 'ES256' NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"encrypted_private_jwk" text,
	"custody" varchar(16) DEFAULT 'platform' NOT NULL,
	"external_key_ref" varchar(512),
	"active" boolean DEFAULT true NOT NULL,
	"rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_branding" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" varchar(2048),
	"logo_dark_url" varchar(2048),
	"favicon_url" varchar(2048),
	"accent_color" varchar(32),
	"display_font" varchar(64),
	"custom_domain" varchar(255),
	"custom_domain_verified_at" timestamp with time zone,
	"footer_text" text,
	"support_url" varchar(2048),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(63) NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"trade_name" varchar(255),
	"country" char(2) NOT NULL,
	"vat_number" varchar(64),
	"eori_number" varchar(64),
	"lei" char(20),
	"gln" char(13),
	"gs1_company_prefix" varchar(12),
	"did" varchar(512),
	"registered_address" jsonb,
	"contact_email" varchar(320),
	"website" varchar(2048),
	"status" "tenant_status" DEFAULT 'onboarding' NOT NULL,
	"plan" varchar(32) DEFAULT 'trial' NOT NULL,
	"passport_quota" integer DEFAULT 100 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" text,
	"role" "role" NOT NULL,
	"status" "user_status" DEFAULT 'invited' NOT NULL,
	"job_title" varchar(255),
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"avatar_url" varchar(2048),
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"failed_sign_in_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"response_status" integer,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"description" varchar(255),
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request_passports" ADD CONSTRAINT "data_request_passports_data_request_id_data_requests_id_fk" FOREIGN KEY ("data_request_id") REFERENCES "public"."data_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request_passports" ADD CONSTRAINT "data_request_passports_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_data_request_id_data_requests_id_fk" FOREIGN KEY ("data_request_id") REFERENCES "public"."data_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_events" ADD CONSTRAINT "passport_events_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_events" ADD CONSTRAINT "passport_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_partners" ADD CONSTRAINT "passport_partners_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_partners" ADD CONSTRAINT "passport_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_status_history" ADD CONSTRAINT "passport_status_history_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_status_history" ADD CONSTRAINT "passport_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_versions" ADD CONSTRAINT "passport_versions_passport_id_passports_id_fk" FOREIGN KEY ("passport_id") REFERENCES "public"."passports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_versions" ADD CONSTRAINT "passport_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passports" ADD CONSTRAINT "passports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signing_keys" ADD CONSTRAINT "signing_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_logs_passport" ON "access_logs" USING btree ("passport_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_access_logs_created" ON "access_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_api_keys_tenant" ON "api_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant_time" ON "audit_events" USING btree ("tenant_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_audit_subject" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_credentials_tenant" ON "credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_credentials_passport" ON "credentials" USING btree ("passport_id");--> statement-breakpoint
CREATE INDEX "idx_credentials_scheme" ON "credentials" USING btree ("scheme");--> statement-breakpoint
CREATE INDEX "idx_credentials_status" ON "credentials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_data_requests_tenant" ON "data_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_data_requests_partner" ON "data_requests" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_documents_tenant" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_documents_passport" ON "documents" USING btree ("passport_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_tenant" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_partners_tenant" ON "partners" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_partners_tier" ON "partners" USING btree ("tenant_id","tier");--> statement-breakpoint
CREATE INDEX "idx_partners_country" ON "partners" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_passport_events_passport" ON "passport_events" USING btree ("passport_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_passport_events_type" ON "passport_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_passport_partners_partner" ON "passport_partners" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_status_history_passport" ON "passport_status_history" USING btree ("passport_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_passport_versions_passport" ON "passport_versions" USING btree ("passport_id");--> statement-breakpoint
CREATE INDEX "idx_passports_tenant" ON "passports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_passports_product" ON "passports" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_passports_status" ON "passports" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_passports_updated" ON "passports" USING btree ("tenant_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_passports_gtin" ON "passports" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "idx_passports_sku" ON "passports" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "idx_products_tenant" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "idx_signing_keys_tenant" ON "signing_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_signing_keys_kid" ON "signing_keys" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "idx_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_users_tenant_role" ON "users" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_endpoint" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_tenant" ON "webhook_endpoints" USING btree ("tenant_id");