import { AppShell } from "@/components/app/AppShell";
import { AppLandingTemplate } from "@/components/app/AppLandingTemplate";
import { AppAnalysisTemplate } from "@/components/app/AppAnalysisTemplate";
import { AppEditorTemplate } from "@/components/app/AppEditorTemplate";
import { landings, socialModes } from "@/data/app-pages";
import type { AppEditorData } from "@/types/app";

const posterEditor: AppEditorData = {
  toolkit: "social",
  activeHref: "/social-media/?tool=poster",
  title: "Social Poster",
  briefFields: [
    { label: "Post text", type: "textarea", placeholder: "What do you want to share?" },
    { label: "Platforms", type: "select" },
    { label: "Schedule", type: "text", placeholder: "Pick a date & time" },
  ],
  scoreLabel: "Post readiness",
  score: 80,
  suggestions: [
    { label: "Add a hashtag", status: "todo" },
    { label: "Attach an image", status: "todo" },
    { label: "Preview on each platform", status: "ok" },
  ],
  previewTitle: "Scheduled post",
  previewBody: [
    "A representative composer to schedule and publish posts across connected platforms.",
    "Approve, schedule, and track posts from a single workspace.",
  ],
  actions: [
    { label: "Save draft", variant: "outline" },
    { label: "Schedule", variant: "primary" },
  ],
};

export default async function SocialMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const { tool } = await searchParams;

  if (tool === "poster") {
    return (
      <AppShell activeToolkit="social" activeHref="/social-media/?tool=poster">
        <AppEditorTemplate data={posterEditor} />
      </AppShell>
    );
  }
  if (tool && socialModes[tool]) {
    return (
      <AppShell activeToolkit="social" activeHref={`/social-media/?tool=${tool}`}>
        <AppAnalysisTemplate data={socialModes[tool]} />
      </AppShell>
    );
  }
  return (
    <AppShell activeToolkit="social" activeHref="/social-media/">
      <AppLandingTemplate data={landings.social} />
    </AppShell>
  );
}
