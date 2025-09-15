-- CreateTable
CREATE TABLE "public"."Players" (
    "id" SERIAL NOT NULL,
    "Uid" TEXT NOT NULL,
    "Username" TEXT,
    "Crew" TEXT,
    "LastSeen" TIMESTAMP(3),

    CONSTRAINT "Players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Uid" ON "public"."Players"("Uid");
