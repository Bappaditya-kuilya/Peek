export function ErrorBanner({ children, tone = 'danger' }) {
  if (!children) {
    return null;
  }

  return <div className={`notice-banner ${tone}`}>{children}</div>;
}
