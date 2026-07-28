import type { Locale } from "@/i18n/config";

/**
 * 공통 셸 UI 문구 사전.
 *
 * 범위: 헤더·푸터·인증 폼처럼 모든 페이지가 공유하는 UI 문구.
 * 공개/앱 페이지 본문은 `site.ts`의 정적 콘텐츠 사전과 각 템플릿의 로케일 변환을 사용한다.
 *
 * 한국어 문구는 원본 `ko.semrush.com` 에서 실측한 표현(예: "가격 책정", "엔터프라이즈",
 * "더보기", "문의하기", "회사 정보", "쿠키 설정", "법률 정보", "개인정보처리방침")을 사용한다.
 */

export interface Dictionary {
  header: {
    logIn: string;
    signUp: string;
    pricing: string;
    enterprise: string;
    more: string;
    openMenu: string;
    closeMenu: string;
    back: string;
    search: string;
  };
  footer: {
    languageLabel: string;
    cookieSettings: string;
    doNotSell: string;
    legal: string;
    privacy: string;
    contact: string;
    company: string;
    blog: string;
  };
  auth: {
    email: string;
    password: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    or: string;
    continueWithGoogle: string;
    continueWithSso: string;
    processing: string;
    unsupportedSocial: string;
    unsupportedSso: string;
    genericError: string;
    seedHint: string;
    terms: string;
    termsOfService: string;
    privacyPolicy: string;
  };
}

const en: Dictionary = {
  header: {
    // 기존 헤더 표기(타이틀 케이스)를 유지한다.
    logIn: "Log In",
    signUp: "Sign Up",
    pricing: "Pricing",
    enterprise: "Enterprise",
    more: "More",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    back: "Back",
    search: "Search",
  },
  footer: {
    languageLabel: "English",
    cookieSettings: "Cookies Settings",
    doNotSell: "Do not sell my personal info",
    legal: "Legal Info",
    privacy: "Privacy Policy",
    contact: "Contact us",
    company: "About us",
    blog: "Blog",
  },
  auth: {
    email: "Email",
    password: "Password",
    emailPlaceholder: "name@company.com",
    passwordPlaceholder: "Enter your password",
    or: "or",
    continueWithGoogle: "Continue with Google",
    continueWithSso: "Continue with SSO",
    processing: "Working…",
    unsupportedSocial: "Social login is not supported in this clone. Please continue with email.",
    unsupportedSso: "SSO is not supported in this clone. Please continue with email.",
    genericError: "We could not process the request. Please try again.",
    seedHint: "Seed account: owner@example.com / password1234",
    terms: "By continuing you agree to the",
    termsOfService: "Terms of Service",
    privacyPolicy: "Privacy Policy",
  },
};

const ko: Dictionary = {
  header: {
    logIn: "로그인",
    signUp: "가입하기",
    pricing: "가격 책정",
    enterprise: "엔터프라이즈",
    more: "더보기",
    openMenu: "메뉴 열기",
    closeMenu: "메뉴 닫기",
    back: "뒤로",
    search: "검색",
  },
  footer: {
    languageLabel: "한국어",
    cookieSettings: "쿠키 설정",
    doNotSell: "내 개인 정보를 판매하지 마세요",
    legal: "법률 정보",
    privacy: "개인정보처리방침",
    contact: "문의하기",
    company: "회사 정보",
    blog: "블로그",
  },
  auth: {
    email: "이메일",
    password: "비밀번호",
    emailPlaceholder: "name@company.com",
    passwordPlaceholder: "비밀번호를 입력하세요",
    or: "또는",
    continueWithGoogle: "Google로 계속하기",
    continueWithSso: "SSO로 계속하기",
    processing: "처리 중…",
    unsupportedSocial: "소셜 로그인은 이 클론에서 지원하지 않습니다. 이메일로 계속해 주세요.",
    unsupportedSso: "SSO는 이 클론에서 지원하지 않습니다. 이메일로 계속해 주세요.",
    genericError: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    seedHint: "시드 계정: owner@example.com / password1234",
    terms: "계속하면 다음에 동의하는 것으로 간주됩니다:",
    termsOfService: "서비스 약관",
    privacyPolicy: "개인정보처리방침",
  },
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ko };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
