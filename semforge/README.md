# SEMForge

한국 SEO 대행사를 위한 주간 검색 가시성 리포트 SaaS입니다.

비공개 베타는 다음 데이터만 하나의 불변 주간 리포트로 제공합니다.

- Google 검색 순위와 AI Overview
- Google Search Console 성과
- NAVER 검색 수요와 블로그 검색 결과 규모
- 웹 리포트, 한글 PDF, 이메일 발송

애플리케이션은 Node.js 24, Next.js 16, PostgreSQL 16을 기준으로 개발합니다. 외부 데이터가 없거나 수집에 실패하면 추정값을 만들지 않고 해당 섹션을 사용할 수 없는 상태로 표시합니다.

구현 순서와 제품 경계는 [canonical task contract](docs/planning/06-tasks.md)를 따릅니다.

유료 production web은 승인된 사업자·개인정보·약관 정보가 없으면 시작되지 않습니다. 운영 값과
승인 절차는 [법률·운영 출시 게이트](docs/release/legal-launch-gate.md)를 따릅니다. 이 체크리스트는
법률 자문이 아니며 실제 유료 초대 전에 전문가 검토가 필요합니다.
