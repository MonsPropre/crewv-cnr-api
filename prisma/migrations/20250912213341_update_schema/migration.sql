-- AlterTable
ALTER TABLE "public"."Players" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

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
