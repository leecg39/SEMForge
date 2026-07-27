import { cookies } from "next/headers";
import { z } from "zod";
import { jsonOk, parseBody, route } from "@/lib/api";
import { LOCALES, LOCALE_COOKIE } from "@/i18n/config";

/** 언어 전환. 쿠키만 바꾸고 URL 은 유지한다. */

const bodySchema = z.object({
  locale: z.enum(LOCALES),
});

export const POST = route(async (request: Request) => {
  const { locale } = await parseBody(request, bodySchema);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return jsonOk({ locale });
});
