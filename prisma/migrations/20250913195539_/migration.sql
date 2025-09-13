-- CreateTable
CREATE TABLE "public"."SystemMetadata" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "lastFetch" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemMetadata_key_key" ON "public"."SystemMetadata"("key");

-- CreateIndex
CREATE INDEX "SystemMetadata_key_idx" ON "public"."SystemMetadata"("key");

-- CreateIndex
CREATE INDEX "SystemMetadata_lastFetch_idx" ON "public"."SystemMetadata"("lastFetch");
