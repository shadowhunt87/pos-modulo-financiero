-- CreateTable
CREATE TABLE "RatioThreshold" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ratioKey" TEXT NOT NULL,
    "greenAt" DECIMAL(19,4) NOT NULL,
    "redAt" DECIMAL(19,4) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatioThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RatioThreshold_companyId_ratioKey_key" ON "RatioThreshold"("companyId", "ratioKey");

-- AddForeignKey
ALTER TABLE "RatioThreshold" ADD CONSTRAINT "RatioThreshold_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

