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
