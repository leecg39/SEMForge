/** CRUD 워크스페이스 설정 계약. 서버 컴포넌트 → 클라이언트로 전달되므로 전부 직렬화 가능해야 한다. */

export type BadgeTone = "green" | "red" | "orange" | "gray" | "blue" | "purple";

export interface ColumnSpec {
  key: string;
  label: string;
  align?: "left" | "right";
  /** text: 그대로 / number: 천단위 / date: Asia/Seoul / badge: badgeMap 사용 / primary: 강조 링크 스타일 */
  type?: "text" | "number" | "date" | "badge" | "primary";
  badgeMap?: Record<string, { label: string; tone: BadgeTone }>;
  /** 값이 없을 때 표시할 문자열. 원본은 미설정 지표를 n/a 로 표기한다 (증거 O) */
  emptyText?: string;
  width?: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox" | "website";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** 생성 시에만 입력 가능. 수정 화면에서는 읽기 전용 텍스트로 표시한다 (원본 규칙 R1) */
  createOnly?: boolean;
  /** 수정 화면에만 노출 (예: 상태 전환) */
  editOnly?: boolean;
}

export interface FilterSpec {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface ResourceSpec {
  /** API 리소스 키 (/api/<key>/) */
  key: string;
  /** 화면 제목 */
  title: string;
  /** 엔티티 단수 라벨 (예: 폴더) */
  label: string;
  description?: string;
  /** 증거 등급 배지: 원본에서 관찰된 범위를 화면에 명시한다 */
  evidence: "O" | "I1" | "P";
  evidenceNote?: string;
  searchPlaceholder: string;
  columns: ColumnSpec[];
  fields: FieldSpec[];
  /**
   * 생성 다이얼로그에서만 다르게 적용할 필드 순서.
   * 원본 폴더 다이얼로그는 생성 시 `웹사이트 → 비즈니스명`, 수정 시 `비즈니스명 → 웹사이트` 순이다. (증거 O)
   */
  createFieldOrder?: string[];
  filters?: FilterSpec[];
  sortOptions: { value: string; label: string }[];
  /** 목록 표시 방식. folder 는 원본 폴더 카드 레이아웃을 재현한다. */
  view?: "table" | "folder";
}
