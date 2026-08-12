## 2026-08-12: P5-SN-T1 - IPv4-mapped IPv6 SSRF 우회

**문제**: 리포트 로고 로더의 자체 IP 판정이 `::ffff:127.0.0.1` 점 표기만 차단하고 `::ffff:7f00:1` 압축 표기는 공개 주소로 오인했다.
**심각도**: HIGH
**원인**: 사이트 등록 경계와 로고 다운로드 경계가 서로 다른 IPv6 파서를 사용해 차단 규칙이 분기됐다.
**해결**: 로고 로더가 검증된 `isPublicIpAddress`를 재사용하고 DNS 결과와 HTTPS pinned 요청 직전에 모두 검사하도록 했다.
**교훈**: SSRF IP 판정은 단일 canonical parser를 모든 네트워크 진입점에서 재사용하고 IPv4-mapped IPv6의 점·16진 압축 표기를 회귀 테스트한다.
