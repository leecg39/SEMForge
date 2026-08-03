export const CONTENT_AI_PROFILES = [
  {
    id: "chatmock-gpt-5.6-luna-xhigh",
    provider: "chatmock",
    providerLabel: "ChatMock",
    model: "gpt-5.6-luna",
    label: "GPT-5.6 Luna · xHigh",
    reasoningEffort: "xhigh",
  },
  {
    id: "xai-grok-4.5",
    provider: "xai",
    providerLabel: "xAI",
    model: "grok-4.5",
    label: "Grok 4.5",
    reasoningEffort: null,
  },
  {
    id: "google-gemini-3.5-flash",
    provider: "google",
    providerLabel: "Google",
    model: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    reasoningEffort: null,
  },
] as const;

export type ContentAiProfileId = (typeof CONTENT_AI_PROFILES)[number]["id"];
export type ContentAiProvider = (typeof CONTENT_AI_PROFILES)[number]["provider"];

export const DEFAULT_CONTENT_AI_PROFILE: ContentAiProfileId = "chatmock-gpt-5.6-luna-xhigh";

export function isContentAiProfileId(value: unknown): value is ContentAiProfileId {
  return CONTENT_AI_PROFILES.some((profile) => profile.id === value);
}

export function getContentAiProfile(profileId: ContentAiProfileId) {
  return CONTENT_AI_PROFILES.find((profile) => profile.id === profileId)!;
}
