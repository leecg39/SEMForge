/** 로그인 앱 페이지 템플릿 데이터 계약 (대표 목데이터 기반). */

export interface Kpi {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
}

export interface SeriesPoint {
  label: string;
  a: number;
  b?: number;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface TableRow {
  [key: string]: string | number;
}

export interface FilterDef {
  label: string;
  options: string[];
}

/** APP-ANALYSIS: 도메인/키워드/트래픽 분석 보고서 */
export interface AnalysisPageData {
  toolkit: string; // app-nav key (seo/ai/traffic/...)
  activeHref: string;
  toolName: string;
  toolDescription: string;
  entityLabel: string; // "Domain" | "Keyword" 등
  entityValue: string; // 예시 대상
  filters: FilterDef[];
  kpis: Kpi[];
  chartTitle: string;
  chartType: "line" | "bar" | "area";
  series: SeriesPoint[];
  seriesLegend?: [string, string?];
  tableTitle: string;
  columns: TableColumn[];
  rows: TableRow[];
  tabs?: string[];
}

/** APP-LANDING: 툴킷 대시보드/온보딩 */
export interface AppLandingData {
  toolkit: string;
  activeHref: string;
  title: string;
  description: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  submitLabel?: string;
  /** 입력 제출 시 이동할 분석 결과 경로. 없으면 폼이 동작하지 않는다. */
  analyzePath?: string;
  features: { title: string; body: string }[];
  quickLinks?: { label: string; href: string }[];
}

/** APP-WORKSPACE: 프로젝트/감사/관리 작업공간 */
export interface AppWorkspaceData {
  toolkit: string;
  activeHref: string;
  title: string;
  projectLabel: string;
  steps?: { title: string; done: boolean }[];
  summary: Kpi[];
  issuesTitle: string;
  issues: { severity: "error" | "warning" | "notice"; label: string; count: number }[];
  columns: TableColumn[];
  rows: TableRow[];
  actions: { label: string; variant?: "primary" | "outline" }[];
}

/** APP-EDITOR: 콘텐츠/광고/보고서 생성 편집기 */
export interface AppEditorData {
  toolkit: string;
  activeHref: string;
  title: string;
  briefFields: { label: string; type: string; placeholder?: string }[];
  scoreLabel: string;
  score: number;
  suggestions: { label: string; status: "ok" | "todo" }[];
  previewTitle: string;
  previewBody: string[];
  actions: { label: string; variant?: "primary" | "outline" }[];
}

/** APP-STORE: 앱 스토어/컬렉션/앱 상세 */
export interface StoreApp {
  name: string;
  category: string;
  blurb: string;
  price: string;
  rating?: number;
}
export interface AppStoreData {
  mode: "store" | "collection" | "detail" | "my-apps";
  title: string;
  description: string;
  categories?: string[];
  apps: StoreApp[];
  detail?: {
    name: string;
    blurb: string;
    longDescription: string[];
    price: string;
    features: string[];
  };
}

/** APP-HOME: 홈/폴더 */
export interface AppHomeData {
  folders: { name: string; sites: number; shared?: boolean }[];
}
