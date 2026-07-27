import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 인벤토리의 canonical URL이 모두 후행 슬래시를 사용하므로 이를 정본으로 처리한다.
  trailingSlash: true,
  // better-sqlite3 는 네이티브 모듈이라 번들 대상에서 제외해야 런타임에 로드된다.
  serverExternalPackages: ["better-sqlite3"],
  // 워크스페이스 루트를 이 프로젝트로 고정해 다중 lockfile 경고를 제거한다.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
