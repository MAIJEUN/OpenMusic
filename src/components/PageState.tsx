import { MdErrorOutline } from 'react-icons/md';

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="page-state">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorView({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="page-state page-state--error">
      <MdErrorOutline className="page-state__icon" />
      <p>{message ?? '문제가 발생했습니다.'}</p>
      {onRetry && (
        <button type="button" className="btn btn--outline" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  );
}
