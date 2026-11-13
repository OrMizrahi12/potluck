CREATE TABLE "app_info" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"greeting" text NOT NULL,
	CONSTRAINT "app_info_single_row" CHECK ("app_info"."id" = 1)
);
