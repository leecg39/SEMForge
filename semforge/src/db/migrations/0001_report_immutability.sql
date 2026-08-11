-- @TASK P3-R1-T1 - Database-enforced immutable weekly report snapshots
-- @SPEC docs/planning/06-tasks.md#p3-r1-t1--주간-불변-리포트-스냅샷
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_key_ck"
  CHECK ("key" in ('rank', 'aio', 'naver', 'gsc'));--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_availability_ck"
  CHECK (("available" and "unavailable_reason" is null) or (not "available" and "unavailable_reason" is not null));--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_snapshot_state_ck"
  CHECK ("status" in ('collecting', 'failed') or ("snapshot" is not null and "snapshot_ready_at" is not null));--> statement-breakpoint

CREATE FUNCTION protect_weekly_report_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'delivered' OR OLD.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'delivered report cannot be mutated' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.snapshot_ready_at IS NOT NULL THEN
    RAISE EXCEPTION 'immutable report snapshot cannot be deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.snapshot_ready_at IS NOT NULL AND (
    NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR
    NEW.site_id IS DISTINCT FROM OLD.site_id OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.comparison_start IS DISTINCT FROM OLD.comparison_start OR
    NEW.comparison_end IS DISTINCT FROM OLD.comparison_end OR
    NEW.snapshot IS DISTINCT FROM OLD.snapshot OR
    NEW.brand_name IS DISTINCT FROM OLD.brand_name OR
    NEW.logo_url IS DISTINCT FROM OLD.logo_url OR
    NEW.accent_color IS DISTINCT FROM OLD.accent_color OR
    NEW.snapshot_ready_at IS DISTINCT FROM OLD.snapshot_ready_at
  ) THEN
    RAISE EXCEPTION 'immutable report snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER weekly_reports_protect_snapshot
BEFORE UPDATE OR DELETE ON weekly_reports
FOR EACH ROW EXECUTE FUNCTION protect_weekly_report_snapshot();--> statement-breakpoint

CREATE FUNCTION protect_report_sections() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  target_workspace_id uuid;
  target_report_id uuid;
  parent_ready_at timestamptz;
BEGIN
  target_workspace_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
  target_report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
  SELECT snapshot_ready_at INTO parent_ready_at
    FROM weekly_reports
   WHERE workspace_id = target_workspace_id AND id = target_report_id;
  IF parent_ready_at IS NOT NULL THEN
    RAISE EXCEPTION 'immutable report sections cannot be changed' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER report_sections_protect_snapshot
BEFORE INSERT OR UPDATE OR DELETE ON report_sections
FOR EACH ROW EXECUTE FUNCTION protect_report_sections();
