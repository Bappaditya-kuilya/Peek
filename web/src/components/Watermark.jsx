export function Watermark({ eyebrow }) {
  return (
    <div className="brand-block">
      <div className="wordmark">Peek</div>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
    </div>
  );
}
