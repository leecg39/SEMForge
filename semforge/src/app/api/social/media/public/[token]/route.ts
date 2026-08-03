import { route } from "@/lib/api";
import {
  readSocialMediaAsset,
  verifySocialMediaToken,
} from "@/server/social/media";
export const GET = route(
  async (
    _request: Request,
    context: { params: Promise<{ token: string }> },
  ) => {
    const { assetId } = verifySocialMediaToken((await context.params).token);
    const { bytes } = await readSocialMediaAsset(assetId);
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
);
