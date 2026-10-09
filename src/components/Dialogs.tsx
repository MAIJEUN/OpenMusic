import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MdClose } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { parseLink, targetToPath } from '../../shared/links';
import { useUi } from '../store/ui';
import { IconButton } from './IconButton';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>{title}</h2>
          <IconButton label="닫기" onClick={onClose}>
            <MdClose />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 링크 입력 폼 (홈 화면과 다이얼로그에서 공유) */
export function LinkForm({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const target = parseLink(value);
    if (!target) {
      setError('YouTube Music 또는 YouTube 재생목록 링크를 입력해 주세요.');
      return;
    }
    setError('');
    setValue('');
    onDone?.();
    navigate(targetToPath(target));
  };

  return (
    <form className="link-form" onSubmit={submit}>
      <div className="link-form__row">
        <input
          ref={inputRef}
          className="link-form__input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            const target = parseLink(text);
            if (target) {
              e.preventDefault();
              setValue('');
              onDone?.();
              navigate(targetToPath(target));
            }
          }}
          placeholder="https://music.youtube.com/playlist?list=..."
          aria-label="재생목록 링크"
          spellCheck={false}
        />
        <button type="submit" className="btn btn--primary">
          열기
        </button>
      </div>
      {error && <div className="link-form__error">{error}</div>}
    </form>
  );
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  const setDialog = useUi((s) => s.setDialog);
  const close = () => setDialog(null);

  if (dialog === 'addLink')
    return (
      <Modal title="재생목록 링크 열기" onClose={close}>
        <p className="modal__desc">
          YouTube Music 재생목록이나 앨범 링크를 붙여넣으세요. 연 재생목록은 사이드바에 등록됩니다. YouTube 재생목록 링크도 사용할 수 있어요.
        </p>
        <LinkForm autoFocus onDone={close} />
      </Modal>
    );

  return null;
}
