-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceKey_prefix_key" ON "ServiceKey"("prefix");

-- CreateIndex
CREATE INDEX "ServiceKey_companyId_idx" ON "ServiceKey"("companyId");

-- AddForeignKey
ALTER TABLE "ServiceKey" ADD CONSTRAINT "ServiceKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

