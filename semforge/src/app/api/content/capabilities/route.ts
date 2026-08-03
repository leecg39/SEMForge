import { jsonOk, route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getChatMockContentCapability } from "@/server/chatmock/client";
import { getContentAiModelCapabilities } from "@/server/content/generation-providers";
import { getFfmpegCapability } from "@/server/content/video-renderer";
import { getXaiVideoCapability } from "@/server/content/xai-video";

export const GET = route(async (request: Request) => {
  await requireAuth(request);
  const chatMock = await getChatMockContentCapability();
  const contentModels = await getContentAiModelCapabilities(chatMock);
  const xaiVideo = getXaiVideoCapability();
  const ffmpeg = await getFfmpegCapability();
  const grok = contentModels.find((model) => model.id === "xai-grok-4.5");
  const hasTalorData = Boolean(process.env.TALORDATA_API_TOKEN?.trim());
  const hasContentModel = contentModels.some((model) => model.enabled);
  return jsonOk({
    articleCreation: {
      enabled: hasTalorData && hasContentModel,
      reason: !hasTalorData
        ? "TALORDATA_API_TOKEN이 필요합니다."
        : hasContentModel
          ? null
          : "사용 가능한 콘텐츠 AI 모델이 없습니다.",
    },
    visualCreation: {
      enabled: chatMock.enabled,
      reason: chatMock.reason,
      model: chatMock.model,
    },
    imageCreation: {
      enabled: chatMock.enabled,
      reason: chatMock.reason,
      model: chatMock.model,
      renderer: "sharp+svg",
    },
    videoCreation: {
      enabled: Boolean(grok?.enabled && xaiVideo.enabled && ffmpeg.enabled),
      reason: !grok?.enabled
        ? grok?.reason ?? "Grok 4.5 설정이 필요합니다."
        : !xaiVideo.enabled
          ? xaiVideo.reason
          : !ffmpeg.enabled
            ? ffmpeg.reason
            : null,
      plannerModel: grok?.model ?? "grok-4.5",
      rendererModel: xaiVideo.model,
      ffmpeg: ffmpeg.enabled,
    },
    talorData: {
      enabled: hasTalorData,
      reason: hasTalorData ? null : "TALORDATA_API_TOKEN이 필요합니다.",
    },
    contentModels,
    chatMock,
  });
});
