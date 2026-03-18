-- CreateTable
CREATE TABLE "public"."ServersHistory" (
    "id" SERIAL NOT NULL,
    "playerCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sId" TEXT NOT NULL,

    CONSTRAINT "ServersHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."ServersHistory" ADD CONSTRAINT "FK_ServersHistory_Servers" FOREIGN KEY ("sId") REFERENCES "public"."Servers"("sId") ON DELETE NO ACTION ON UPDATE NO ACTION;
