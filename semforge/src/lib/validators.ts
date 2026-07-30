import { z } from "zod";

/**
 * 공용 입력 검증.
 * 도메인 오류 메시지는 원본 SEMForge 폴더 생성 폼에서 실측한 문구를 그대로 사용한다. (증거 등급 O)
 */

export const DOMAIN_ERROR = "올바른 웹사이트를 입력하세요.";

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/;

/** `https://Example.com/path?x=1` → `example.com` */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^\/+/, "")
    .split(/[/?#]/)[0]
    .replace(/\.$/, "");
}

export const domainSchema = z
  .string()
  .min(1, DOMAIN_ERROR)
  .transform(normalizeDomain)
  .refine((value) => DOMAIN_PATTERN.test(value), { message: DOMAIN_ERROR });

export const nameSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .string()
      .min(1, "비즈니스명을 입력하세요.")
      .max(100, "100자 이하로 입력하세요.")
  );

export function titleSchema(label: string, max = 150) {
  return z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, `${label}을(를) 입력하세요.`)
        .max(max, `${max}자 이하로 입력하세요.`)
    );
}

export const emailSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email("올바른 이메일 주소를 입력하세요."));

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 8자 이상이어야 합니다.")
  .max(200, "비밀번호가 너무 깁니다.");

/** 낙관적 잠금용. 수정 요청은 클라이언트가 마지막으로 읽은 version 을 함께 보낸다. */
export const versionField = z.coerce.number().int().positive().optional();
