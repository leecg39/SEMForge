-- 스키마 동기화 앵커 (no-op).
--
-- 0006~0011 은 스웜 병렬 작업 중 수작업 SQL 로 추가되어 drizzle 스냅샷이 없었다.
-- 스키마 코드(src/db/schema)를 실제 DB 와 일치하도록 정합화한 뒤 drizzle-kit
-- generate 를 실행해 산출된 diff 가 0006~0011 의 합과 정확히 일치함을 확인했다
-- (드리프트 0 증명). DDL 은 이미 전부 적용되어 있으므로 이 파일은 no-op 으로
-- 남기고, 함께 생성된 0012 스냅샷이 이후 generate 의 기준점이 된다.
CREATE TABLE IF NOT EXISTS `__schema_sync_anchor` (`id` integer PRIMARY KEY);--> statement-breakpoint
DROP TABLE IF EXISTS `__schema_sync_anchor`;
