-- CreateTable
CREATE TABLE "public"."Players" (
    "id" SERIAL NOT NULL,
    "Uid" TEXT NOT NULL,
    "Username" TEXT,
    "Crew" TEXT,
    "LastSeen" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Players_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "Uid" ON "public"."Players"("Uid");

-- CreateIndex
CREATE INDEX "Players_Username_idx" ON "public"."Players"("Username");

-- CreateIndex
CREATE INDEX "Players_Crew_idx" ON "public"."Players"("Crew");

-- CreateIndex
CREATE INDEX "Players_LastSeen_idx" ON "public"."Players"("LastSeen");

-- CreateIndex
CREATE INDEX "Players_Username_Crew_idx" ON "public"."Players"("Username", "Crew");

-- CreateIndex
CREATE INDEX "Players_LastSeen_Username_idx" ON "public"."Players"("LastSeen", "Username");

-- CreateIndex
CREATE INDEX "Players_Uid_Username_idx" ON "public"."Players"("Uid", "Username");

-- CreateIndex
CREATE INDEX "Players_createdAt_idx" ON "public"."Players"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemMetadata_key_key" ON "public"."SystemMetadata"("key");

-- CreateIndex
CREATE INDEX "SystemMetadata_key_idx" ON "public"."SystemMetadata"("key");

-- CreateIndex
CREATE INDEX "SystemMetadata_lastFetch_idx" ON "public"."SystemMetadata"("lastFetch");
