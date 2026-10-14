-- CreateTable
CREATE TABLE "UserTwoFactor" (
    "userId" TEXT NOT NULL,
    "secretEnc" TEXT,
    "enabledAt" TIMESTAMP(3),
    "enabledIp" TEXT,
    "pendingSecretEnc" TEXT,
    "pendingExpiresAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "enrollAllowedUntil" TIMESTAMP(3),
    "totpFailures" INTEGER NOT NULL DEFAULT 0,
    "totpLockedUntil" TIMESTAMP(3),
    "totpDayFailures" INTEGER NOT NULL DEFAULT 0,
    "totpDayStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTwoFactor_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserRecoveryCode_codeHash_key" ON "UserRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "UserRecoveryCode_userId_idx" ON "UserRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "UserTwoFactor" ADD CONSTRAINT "UserTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRecoveryCode" ADD CONSTRAINT "UserRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
