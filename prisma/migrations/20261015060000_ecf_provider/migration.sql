-- AlterTable
ALTER TABLE "EcfDocument" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "contingencySince" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "providerCode" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "trackId" TEXT;

-- CreateTable
CREATE TABLE "EcfConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'TEST',
    "numbering" TEXT NOT NULL DEFAULT 'OURS',
    "settings" JSONB,
    "credentialsEnc" TEXT,
    "ecfTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcfConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcfEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ecfDocumentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcfEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcfConnection_companyId_key" ON "EcfConnection"("companyId");

-- CreateIndex
CREATE INDEX "EcfEvent_ecfDocumentId_idx" ON "EcfEvent"("ecfDocumentId");

-- CreateIndex
CREATE INDEX "EcfEvent_companyId_idx" ON "EcfEvent"("companyId");

-- CreateIndex
CREATE INDEX "EcfDocument_status_nextAttemptAt_idx" ON "EcfDocument"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "EcfConnection" ADD CONSTRAINT "EcfConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcfEvent" ADD CONSTRAINT "EcfEvent_ecfDocumentId_fkey" FOREIGN KEY ("ecfDocumentId") REFERENCES "EcfDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
