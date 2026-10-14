-- CreateTable
CREATE TABLE "SampleRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SampleRecord_companyId_idx" ON "SampleRecord"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SampleRecord_entityType_entityId_key" ON "SampleRecord"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "SampleRecord" ADD CONSTRAINT "SampleRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
