-- CreateTable
CREATE TABLE "SkillDomainRelevance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "campaignId" TEXT,
    "skillName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "relevance" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SkillDomainRelevance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SkillDomainRelevance_campaignId_idx" ON "SkillDomainRelevance"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDomainRelevance_scope_skillName_domain_key" ON "SkillDomainRelevance"("scope", "skillName", "domain");

