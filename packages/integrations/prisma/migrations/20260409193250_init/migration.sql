-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "scan_jobs" (
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "ScanJobStatus" NOT NULL,
    "repository_path" TEXT NOT NULL,
    "changed_files_json" JSONB NOT NULL,
    "repository_full_name" TEXT,
    "pull_request_number" INTEGER,
    "delivery_id" TEXT,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "findings_reports" (
    "job_id" TEXT NOT NULL,
    "produced_at" TIMESTAMP(3) NOT NULL,
    "summary_json" JSONB NOT NULL,
    "pull_request_comment_body" TEXT NOT NULL,

    CONSTRAINT "findings_reports_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "pull_request_comments" (
    "comment_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "pull_request_number" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL,
    "provider" TEXT NOT NULL,
    "remote_comment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pull_request_comments_pkey" PRIMARY KEY ("comment_id")
);

-- CreateIndex
CREATE INDEX "idx_scan_jobs_status" ON "scan_jobs"("status");

-- CreateIndex
CREATE INDEX "idx_scan_jobs_repo_pr" ON "scan_jobs"("repository_full_name", "pull_request_number");

-- CreateIndex
CREATE INDEX "idx_findings_reports_produced_at" ON "findings_reports"("produced_at");

-- CreateIndex
CREATE INDEX "idx_pull_request_comments_job_id" ON "pull_request_comments"("job_id");

-- CreateIndex
CREATE INDEX "idx_pull_request_comments_repo_pr" ON "pull_request_comments"("repository_full_name", "pull_request_number");

-- AddForeignKey
ALTER TABLE "findings_reports" ADD CONSTRAINT "findings_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scan_jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;
