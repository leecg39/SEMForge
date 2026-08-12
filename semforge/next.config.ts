import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // @TASK P4-O1-T1 - Emit the minimal traced server used by the web image.
  output: "standalone",
  // 인벤토리의 canonical URL이 모두 후행 슬래시를 사용하므로 이를 정본으로 처리한다.
  trailingSlash: true,
  // 로컬 QA와 앱 내 브라우저가 사용하는 loopback 호스트에서도 개발 클라이언트가 수화되게 한다.
  allowedDevOrigins: ["127.0.0.1"],
  // 워크스페이스 루트를 이 프로젝트로 고정해 다중 lockfile 경고를 제거한다.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
