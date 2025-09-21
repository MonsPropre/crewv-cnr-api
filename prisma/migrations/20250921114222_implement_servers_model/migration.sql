-- CreateTable
CREATE TABLE "public"."Servers" (
    "id" SERIAL NOT NULL,
    "sId" TEXT NOT NULL,
    "time" TEXT,
    "restartAt" TIMESTAMP(3),

    CONSTRAINT "Servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sId" ON "public"."Servers"("sId");
