import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import {
  readSocialMediaAsset,
  requireSocialMediaAsset,
} from "@/server/social/media";
export const GET = route(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAuth(request);
    const { id } = await context.params;
    await requireSocialMediaAsset(auth, id);
    const { bytes } = await readSocialMediaAsset(id);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
  },
);
