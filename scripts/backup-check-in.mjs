// Tells Sentry's cron monitor where tonight's backup is (#11):
//   SENTRY_DSN=… CHECK_IN_ID=<uuid> BACKUP_SCHEDULE="23 3 * * *" \
//     node scripts/backup-check-in.mjs in_progress|ok|error
// .github/workflows/backup.yml runs it at the start and end of each backup.
// Each check-in carries the monitor's config, so the first one creates the
// monitor and later ones keep it on the workflow's schedule.
//
// A refused start check-in only warns: the backup matters more. A refused end
// check-in fails the step (after the upload), since a monitor that never hears
// back would alert anyway. The DSN is never printed.
import { sendCheckIn } from "./sentry-check-in.mjs";

const SLUG = "potluck-nightly-backup";
const STATUSES = ["in_progress", "ok", "error"];

const status = process.argv[2];
const schedule = process.env.BACKUP_SCHEDULE ?? "";
if (!STATUSES.includes(status) || !schedule || !process.env.CHECK_IN_ID) {
  console.error(
    `Usage: SENTRY_DSN, CHECK_IN_ID and BACKUP_SCHEDULE set; one argument of ${STATUSES.join(", ")}`
  );
  process.exit(1);
}

const result = await sendCheckIn({
  dsn: process.env.SENTRY_DSN ?? "",
  slug: SLUG,
  status,
  checkInId: process.env.CHECK_IN_ID,
  monitorConfig: {
    schedule: { type: "crontab", value: schedule },
    // GitHub can start a scheduled run late, an hour or more when busy.
    checkin_margin: 180,
    // The job's own timeout.
    max_runtime: 30,
    failure_issue_threshold: 1,
    recovery_threshold: 1,
    timezone: "UTC",
  },
});

if (result.sent) {
  console.log(`✓ ${result.summary} (monitor ${SLUG})`);
} else if (status === "in_progress") {
  console.log(`::warning::Sentry check-in not sent: ${result.summary}`);
} else {
  console.log(`::error::Sentry check-in not sent: ${result.summary}`);
  process.exit(1);
}
