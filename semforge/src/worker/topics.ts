// @TASK P3-P1-FIX - Production collection outbox topic mapping
// @SPEC docs/planning/06-tasks.md#p3-w1-t1--lease-기반-작업-큐와-transactional-outbox

export const COLLECTION_TOPIC_TO_JOB_TYPE = {
  "collection.google.weekly": "collect.google",
  "collection.naver.weekly": "collect.naver",
  "collection.gsc.weekly": "collect.gsc.weekly",
} as const;

export type CollectionOutboxTopic = keyof typeof COLLECTION_TOPIC_TO_JOB_TYPE;

export const COLLECTION_OUTBOX_TOPICS = Object.freeze(
  Object.keys(COLLECTION_TOPIC_TO_JOB_TYPE) as CollectionOutboxTopic[],
);

export const REPORT_TOPIC_TO_JOB_TYPE = {
  "report.snapshot": "report.snapshot",
  "report.pdf.render": "report.pdf.render",
  "report.email.deliver": "report.email.deliver",
} as const;

export const AUTH_TOPIC_TO_JOB_TYPE = {
  "email.password_reset": "email.password_reset",
} as const;

export const PRODUCTION_TOPIC_TO_JOB_TYPE = {
  ...COLLECTION_TOPIC_TO_JOB_TYPE,
  ...REPORT_TOPIC_TO_JOB_TYPE,
  ...AUTH_TOPIC_TO_JOB_TYPE,
} as const;

export type ProductionOutboxTopic = keyof typeof PRODUCTION_TOPIC_TO_JOB_TYPE;

export const PRODUCTION_OUTBOX_TOPICS = Object.freeze(
  Object.keys(PRODUCTION_TOPIC_TO_JOB_TYPE) as ProductionOutboxTopic[],
);
