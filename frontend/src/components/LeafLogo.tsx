/** Logo propio: una hoja verde con su nervadura, que sugiere también la estela de un avión. */
export function LeafLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="leaf-gradient" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1B5E20" />
          <stop offset="1" stopColor="#66BB6A" />
        </linearGradient>
      </defs>
      <path d="M8 40C8 20 20 6 42 6c0 22-14 34-34 34Z" fill="url(#leaf-gradient)" />
      <path d="M10 38C18 28 26 20 38 10" stroke="#E8F5E9" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M18 30l-1-7M24 24l-1-7M30 18l-1-6M18 30l7 1M24 24l7 1" stroke="#E8F5E9" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
