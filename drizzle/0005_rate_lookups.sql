CREATE TABLE "rate_lookups" (
	"foreign_currency" text NOT NULL,
	"group_currency" text NOT NULL,
	"date" date NOT NULL,
	"answer" text NOT NULL,
	"rate" numeric,
	"rate_date" date,
	"expires_at" timestamp with time zone,
	CONSTRAINT "rate_lookups_foreign_currency_group_currency_date_pk" PRIMARY KEY("foreign_currency","group_currency","date"),
	CONSTRAINT "rate_lookups_answer_whole" CHECK (("rate_lookups"."answer" = 'found' AND "rate_lookups"."rate" IS NOT NULL AND "rate_lookups"."rate" > 0 AND "rate_lookups"."rate_date" IS NOT NULL) OR ("rate_lookups"."answer" = 'unavailable' AND "rate_lookups"."rate" IS NULL AND "rate_lookups"."rate_date" IS NULL))
);
