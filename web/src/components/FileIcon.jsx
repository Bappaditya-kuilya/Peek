export function FileIcon({ type = 'generic' }) {
  const color = 'var(--color-text-tertiary)';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 2C3 1.45 3.45 1 4 1H10L13 4V14C13 14.55 12.55 15 12 15H4C3.45 15 3 14.55 3 14V2Z"
        stroke={color}
        strokeWidth="1.2"
      />
      <path d="M10 1V4H13" stroke={color} strokeWidth="1.2" />
      {type === 'doc' && (
        <>
          <line x1="5.5" y1="7" x2="10.5" y2="7" stroke={color} strokeWidth="1" />
          <line x1="5.5" y1="9.5" x2="10.5" y2="9.5" stroke={color} strokeWidth="1" />
          <line x1="5.5" y1="12" x2="8.5" y2="12" stroke={color} strokeWidth="1" />
        </>
      )}
      {type === 'image' && (
        <>
          <rect x="5" y="6.5" width="6" height="5" stroke={color} strokeWidth="1" rx="0.5" />
          <path d="M5 10L7 8L8.5 9.5L10 8.5L11 10" stroke={color} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
