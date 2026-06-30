-- TD-2026-06-17-004 fix: persist TaskEnvelope on WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN "envelopeSnapshot" TEXT;
