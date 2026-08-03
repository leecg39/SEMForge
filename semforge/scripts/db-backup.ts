import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * SQLite 백업 스크립트. `npm run db:backup` 으로 실행한다.
 * WAL 모드에서도 일관된 스냅샷을 만들도록 VACUUM INTO 를 사용한다.
 * 산출물: data/backups/app-YYYYMMDD-HHmmss.db
 */

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
if (!fs.existsSync(dbPath)) {
  console.error(`[db-backup] DB 파일이 없습니다: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.join(path.dirname(dbPath), "backups");
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace("T", "-")
  .slice(0, 15);
const backupPath = path.join(backupDir, `app-${stamp}.db`);
const assetRoot = path.resolve(
  process.env.CONTENT_ASSET_ROOT ?? path.join(process.cwd(), "data", "content-assets"),
);
const assetBackupPath = path.join(backupDir, `content-assets-${stamp}`);

const sqlite = new Database(dbPath, { readonly: true });
sqlite.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
sqlite.close();

const sizeMb = (fs.statSync(backupPath).size / 1048576).toFixed(1);
console.log(`[db-backup] 완료 → ${backupPath} (${sizeMb}MB)`);

if (fs.existsSync(assetRoot)) {
  fs.cpSync(assetRoot, assetBackupPath, { recursive: true, errorOnExist: true });
  console.log(`[db-backup] 콘텐츠 자산 완료 → ${assetBackupPath}`);
}
