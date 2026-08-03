import { registerDueJob } from "@/server/providers/scheduler";
import { processDueSocial } from "./runs";

export const SOCIAL_DUE_JOB_NAME = "social_publish_and_sync_due";
let registered = false;

export function registerSocialDueJob() {
  if (registered) return;
  registerDueJob(SOCIAL_DUE_JOB_NAME, ({ now, limit }) =>
    processDueSocial({ now, limit }),
  );
  registered = true;
}
