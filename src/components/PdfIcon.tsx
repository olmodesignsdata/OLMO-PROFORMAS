export function PdfIcon({
  className = 'h-4 w-4 shrink-0',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="12"
        width="17"
        height="7.5"
        rx="1.5"
        fill="currentColor"
      />
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fill="#000000"
        fontSize="5.6"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        PDF
      </text>
    </svg>
  );
}
