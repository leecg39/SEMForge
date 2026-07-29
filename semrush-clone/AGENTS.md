<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 실행 환경

- 개발 서버는 **Homebrew Node v25**로 실행해야 한다. 기본 PATH의 Node v22로 띄우면 `better-sqlite3` 네이티브 모듈 버전 불일치로 `/home/` 등이 500 오류를 반환한다.
- Node 버전을 바꿔 쓰려면 `npm rebuild better-sqlite3`로 해당 버전에 맞게 재컴파일할 것.
- TalorData 연동에는 `.env.local`의 `TALORDATA_API_TOKEN`이 필요하며, 브라우저 자동화는 ego-browser(ego-lite)가 기본이다.

