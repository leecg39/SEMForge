// @TASK P1-F1-T1 - Core navigation icons
// @SPEC SEMForge paid beta plan#core-navigation
type CoreIconName =
  | "overview"
  | "sites"
  | "reports"
  | "billing"
  | "settings"
  | "arrow"
  | "check"
  | "alert"
  | "clock";

const paths: Record<CoreIconName, React.ReactNode> = {
  overview: <path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z" />,
  sites: <path d="M4 5.5h16v13H4v-13Zm0 4h16M8 7.5h.01M11 7.5h.01" />,
  reports: <path d="M6 3.5h9l3 3v14H6v-17Zm9 0v4h3M9 12h6M9 16h6M9 8h2" />,
  billing: <path d="M3.5 7h17v11h-17V7Zm0 3.5h17M7 15h4" />,
  settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5 1.2 2.2 2.5.5 1.8-1.7 2 2-1.7 1.8.5 2.5 2.2 1.2-2.2 1.2-.5 2.5 1.7 1.8-2 2-1.8-1.7-2.5.5L12 20.5l-1.2-2.2-2.5-.5-1.8 1.7-2-2 1.7-1.8-.5-2.5L3.5 12l2.2-1.2.5-2.5-1.7-1.8 2-2 1.8 1.7 2.5-.5L12 3.5Z" />,
  arrow: <path d="m8 5 7 7-7 7M4 12h11" />,
  check: <path d="m5 12 4 4 10-10" />,
  alert: <path d="M12 4 3.5 20h17L12 4Zm0 5.5v4M12 17h.01" />,
  clock: <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4v5l3 2" />,
};

export function CoreIcon({ name, size = 20 }: { name: CoreIconName; size?: number }) {
  return (
    <svg
      className="sf-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
