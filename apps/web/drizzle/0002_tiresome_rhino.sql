CREATE TABLE "document_blobs" (
	"content_hash" char(66) PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
