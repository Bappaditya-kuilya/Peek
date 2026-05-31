import { useEffect, useState } from 'react';

export function NumericCodeInput({ autoFocus = false, onComplete }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (value.length === 6) {
      onComplete?.(value).catch?.(() => {
        setError(true);
        setValue('');
      });
    }
  }, [onComplete, value]);

  return (
    <div className="numeric-input-shell">
      <input
        autoFocus={autoFocus}
        className={`numeric-input ${error ? 'error' : ''}`}
        inputMode="numeric"
        maxLength={6}
        pattern="[0-9]*"
        aria-invalid={error}
        value={value}
        onChange={(event) => {
          setError(false);
          setValue(event.target.value.replace(/\D/g, '').slice(0, 6));
        }}
      />
    </div>
  );
}
