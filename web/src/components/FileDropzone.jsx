export function FileDropzone({ children, onClick }) {
  return (
    <button type="button" className="receive-dropzone" onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}
