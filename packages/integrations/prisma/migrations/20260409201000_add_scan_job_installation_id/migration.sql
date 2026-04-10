-- AlterTable
ALTER TABLE "scan_jobs"
ADD COLUMN "installation_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_scan_jobs_installation_id" ON "scan_jobs"("installation_id");
