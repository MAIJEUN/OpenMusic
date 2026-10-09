import { Link } from 'react-router-dom';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="OpenMusic 홈">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
        <defs>
          <linearGradient id="om-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff4e45" />
            <stop offset="1" stopColor="#c70f5b" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="url(#om-logo)" />
        <rect x="8.5" y="13" width="3" height="8" rx="1.5" fill="#fff" />
        <rect x="14.5" y="9" width="3" height="14" rx="1.5" fill="#fff" />
        <rect x="20.5" y="11.5" width="3" height="10" rx="1.5" fill="#fff" />
      </svg>
      <span className="logo__text">OpenMusic</span>
    </Link>
  );
}
