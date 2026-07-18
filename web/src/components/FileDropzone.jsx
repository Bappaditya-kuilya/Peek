import { useState } from 'react';

export function FileDropzone({ children, onClick, onDrop }) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      onDrop?.(files);
    }
  }

  return (
    <button
      type="button"
      className={`receive-dropzone${isDragging ? ' drag-over' : ''}`}
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span>{children}</span>
    </button>
  );
}
