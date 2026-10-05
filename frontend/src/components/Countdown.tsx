import { useEffect, useState } from 'react';

/** Cuenta regresiva hasta `expiresAt`; avisa una vez al llegar a cero. */
export function Countdown({ expiresAt, onExpire }: { expiresAt: string; onExpire?: () => void }) {
  const remaining = () => Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(remaining);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const value = remaining();
      setSeconds(value);
      if (value === 0) {
        window.clearInterval(timer);
        onExpire?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const minutes = Math.floor(seconds / 60);
  const text = `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <span className={`countdown ${seconds < 120 ? 'countdown-urgent' : ''}`} role="timer" aria-live="off">
      {text}
    </span>
  );
}
