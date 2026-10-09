import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export function IconButton({ label, children, size = 'md', active, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-btn icon-btn--${size} ${active ? 'icon-btn--active' : ''} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
