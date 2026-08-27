-- CreateEnum
CREATE TYPE "AffiliatorStatus" AS ENUM ('APPROVED', 'PENDING_APPROVAL', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AffiliatorTier" AS ENUM ('STARTER', 'PRO', 'ELITE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'DRAFT', 'OUT_OF_STOCK');

-- CreateEnum
CREATE TYPE "PageStatus" AS ENUM ('PUBLISHED', 'DRAFT');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AFFILIATOR';

-- AlterTable
ALTER TABLE "recommendation_products" ADD COLUMN     "listing_id" UUID;

-- AlterTable
ALTER TABLE "recommendations" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "scans" ADD COLUMN     "ai_page_id" UUID,
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "affiliator_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "niche" TEXT,
    "social_platforms" JSONB NOT NULL DEFAULT '{}',
    "api_key" TEXT NOT NULL,
    "status" "AffiliatorStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "tier" "AffiliatorTier" NOT NULL DEFAULT 'STARTER',
    "planStatus" "PlanStatus" NOT NULL DEFAULT 'TRIALING',
    "monthly_scan_usage" INTEGER NOT NULL DEFAULT 0,
    "monthly_scan_limit" INTEGER NOT NULL DEFAULT 1000,
    "notify_email_digest" BOOLEAN NOT NULL DEFAULT true,
    "notify_conversion_alerts" BOOLEAN NOT NULL DEFAULT true,
    "notify_weekly_report" BOOLEAN NOT NULL DEFAULT true,
    "notify_new_features" BOOLEAN NOT NULL DEFAULT false,
    "followers_count" TEXT NOT NULL DEFAULT '0',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_pages" (
    "id" UUID NOT NULL,
    "affiliator_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "welcome_message" TEXT,
    "primary_color" TEXT NOT NULL,
    "accent_color" TEXT NOT NULL,
    "allow_camera_upload" BOOLEAN NOT NULL DEFAULT true,
    "custom_domain" TEXT,
    "status" "PageStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_page_featured_listings" (
    "ai_page_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_page_featured_listings_pkey" PRIMARY KEY ("ai_page_id","listing_id")
);

-- CreateTable
CREATE TABLE "affiliator_listings" (
    "id" UUID NOT NULL,
    "affiliator_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "affiliate_url" TEXT NOT NULL,
    "price_override" INTEGER,
    "original_price_override" INTEGER,
    "shade_override" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "match_score_weight" INTEGER NOT NULL DEFAULT 80,
    "affiliator_note" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue_generated" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliator_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "click_events" (
    "id" UUID NOT NULL,
    "affiliator_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "lead_id" UUID,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_view_events" (
    "id" UUID NOT NULL,
    "ai_page_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_view_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_leads" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "ai_page_id" UUID NOT NULL,
    "follower_name" TEXT,
    "follower_handle" TEXT,
    "email" TEXT,
    "selfie_url" TEXT,
    "location" TEXT,
    "top_matched_product" TEXT,
    "matched_product_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_affiliate" BOOLEAN NOT NULL DEFAULT false,
    "estimated_commission" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliator_profiles_user_id_key" ON "affiliator_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliator_profiles_handle_key" ON "affiliator_profiles"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "affiliator_profiles_api_key_key" ON "affiliator_profiles"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_pages_slug_key" ON "ai_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "affiliator_listings_affiliator_id_product_id_key" ON "affiliator_listings"("affiliator_id", "product_id");

-- CreateIndex
CREATE INDEX "click_events_affiliator_id_created_at_idx" ON "click_events"("affiliator_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "page_view_events_ai_page_id_created_at_idx" ON "page_view_events"("ai_page_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_leads_scan_id_key" ON "customer_leads"("scan_id");

-- CreateIndex
CREATE INDEX "customer_leads_ai_page_id_created_at_idx" ON "customer_leads"("ai_page_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "affiliator_profiles" ADD CONSTRAINT "affiliator_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pages" ADD CONSTRAINT "ai_pages_affiliator_id_fkey" FOREIGN KEY ("affiliator_id") REFERENCES "affiliator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_page_featured_listings" ADD CONSTRAINT "ai_page_featured_listings_ai_page_id_fkey" FOREIGN KEY ("ai_page_id") REFERENCES "ai_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_page_featured_listings" ADD CONSTRAINT "ai_page_featured_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "affiliator_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliator_listings" ADD CONSTRAINT "affiliator_listings_affiliator_id_fkey" FOREIGN KEY ("affiliator_id") REFERENCES "affiliator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliator_listings" ADD CONSTRAINT "affiliator_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "affiliator_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "customer_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_view_events" ADD CONSTRAINT "page_view_events_ai_page_id_fkey" FOREIGN KEY ("ai_page_id") REFERENCES "ai_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_leads" ADD CONSTRAINT "customer_leads_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_leads" ADD CONSTRAINT "customer_leads_ai_page_id_fkey" FOREIGN KEY ("ai_page_id") REFERENCES "ai_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_ai_page_id_fkey" FOREIGN KEY ("ai_page_id") REFERENCES "ai_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_products" ADD CONSTRAINT "recommendation_products_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "affiliator_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
