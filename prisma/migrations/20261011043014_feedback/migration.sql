-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('CONFUSING', 'BROKEN', 'IDEA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'PLANNED', 'DONE', 'WONT_DO', 'DUPLICATE');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "userAgent" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "response" TEXT,
    "taskRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_companyId_createdAt_idx" ON "Feedback"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Topes de tamaño también en la BD (Prisma no los expresa en el schema): aunque un bug
-- o un script se salte el DTO, nadie llena la tabla con textos enormes.
ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_lengths_check"
  CHECK (
    char_length("message") BETWEEN 1 AND 2000
    AND char_length("route") BETWEEN 1 AND 200
    AND ("userAgent" IS NULL OR char_length("userAgent") <= 500)
    AND ("response" IS NULL OR char_length("response") <= 1000)
    AND ("taskRef" IS NULL OR char_length("taskRef") <= 100)
  );
