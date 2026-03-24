-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicKeyMultibase" TEXT NOT NULL,
    "privateKeyMultibase" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeClass" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "externalCourseId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BadgeClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assertion" (
    "id" UUID NOT NULL,
    "badgeClassId" UUID NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "issuedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" JSONB NOT NULL,

    CONSTRAINT "Assertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_apiKey_key" ON "Tenant"("apiKey");

-- CreateIndex
CREATE INDEX "BadgeClass_tenantId_idx" ON "BadgeClass"("tenantId");

-- CreateIndex
CREATE INDEX "BadgeClass_externalCourseId_idx" ON "BadgeClass"("externalCourseId");

-- CreateIndex
CREATE INDEX "Assertion_badgeClassId_idx" ON "Assertion"("badgeClassId");

-- CreateIndex
CREATE INDEX "Assertion_recipientEmail_idx" ON "Assertion"("recipientEmail");

-- AddForeignKey
ALTER TABLE "BadgeClass" ADD CONSTRAINT "BadgeClass_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assertion" ADD CONSTRAINT "Assertion_badgeClassId_fkey" FOREIGN KEY ("badgeClassId") REFERENCES "BadgeClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
