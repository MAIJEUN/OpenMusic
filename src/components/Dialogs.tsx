import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MdAdd, MdClose } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { parseLink, targetToPath } from '../../shared/links';
import type { Track } from '../../shared/types';
import { localInfo, useLibrary } from '../store/library';
import { deleteLocalPlaylist } from './menus';
import { toast, useUi } from '../store/ui';
import { CollectionArt } from './CollectionArt';
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

function NewPlaylistForm({ tracks, suggestedTitle, onDone }: { tracks?: Track[]; suggestedTitle?: string; onDone: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(suggestedTitle ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = useLibrary.getState().createPlaylist(title, tracks);
    onDone();
    toast(tracks?.length ? `${tracks.length}곡으로 재생목록을 만들었습니다` : '재생목록을 만들었습니다');
    navigate(`/playlist?list=${encodeURIComponent(id)}`);
  };
  return (
    <form className="link-form" onSubmit={submit}>
      <div className="link-form__row">
        <input
          ref={inputRef}
          className="link-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="재생목록 이름"
          aria-label="재생목록 이름"
          maxLength={100}
        />
        <button type="submit" className="btn btn--primary">
          만들기
        </button>
      </div>
      {tracks && tracks.length > 0 && <div className="modal__hint">{tracks.length}곡이 함께 저장됩니다</div>}
    </form>
  );
}

function SaveToPlaylist({ tracks, suggestedTitle, onDone }: { tracks: Track[]; suggestedTitle?: string; onDone: () => void }) {
  const playlists = useLibrary((s) => s.playlists);
  const [creating, setCreating] = useState(playlists.length === 0);
  if (creating) return <NewPlaylistForm tracks={tracks} suggestedTitle={suggestedTitle} onDone={onDone} />;
  return (
    <div className="save-to">
      <button type="button" className="save-to__new" onClick={() => setCreating(true)}>
        <span className="save-to__new-icon">
          <MdAdd />
        </span>
        새 재생목록
      </button>
      <div className="save-to__list">
        {playlists.map((p) => {
          const info = localInfo(p);
          return (
            <button
              key={p.id}
              type="button"
              className="save-to__item"
              onClick={() => {
                const added = useLibrary.getState().addToPlaylist(p.id, tracks);
                onDone();
                if (added === 0) toast(`이미 '${p.title}'에 있는 곡입니다`);
                else if (added < tracks.length) toast(`'${p.title}'에 ${added}곡을 저장했습니다 (중복 ${tracks.length - added}곡 제외)`);
                else toast(added > 1 ? `'${p.title}'에 ${added}곡을 저장했습니다` : `'${p.title}'에 저장했습니다`);
              }}
            >
              <CollectionArt info={info} size={48} className="save-to__art" />
              <span className="save-to__text">
                <span className="save-to__title">{p.title}</span>
                <span className="save-to__sub">{p.tracks.length}곡</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmDelete({ playlistId, afterDelete, onDone }: { playlistId: string; afterDelete?: () => void; onDone: () => void }) {
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === playlistId));
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 실수로 Enter를 눌러도 지워지지 않도록 '취소'에 먼저 포커스
  useEffect(() => cancelRef.current?.focus(), []);
  if (!playlist) return null;
  return (
    <div className="confirm">
      <div className="confirm__target">
        <CollectionArt info={localInfo(playlist)} size={56} className="confirm__art" />
        <div className="confirm__text">
          <div className="confirm__title">{playlist.title}</div>
          <div className="confirm__sub">내 재생목록 • {playlist.tracks.length}곡</div>
        </div>
      </div>
      <p className="modal__desc">이 재생목록을 삭제할까요? 재생목록에 담긴 곡 목록이 함께 삭제됩니다.</p>
      <div className="confirm__actions">
        <button ref={cancelRef} type="button" className="btn btn--outline" onClick={onDone}>
          취소
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            onDone();
            deleteLocalPlaylist(playlistId, afterDelete);
          }}
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function RenameForm({ playlistId, onDone }: { playlistId: string; onDone: () => void }) {
  const current = useLibrary((s) => s.playlists.find((p) => p.id === playlistId));
  const [title, setTitle] = useState(current?.title ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  if (!current) return null;
  return (
    <form
      className="link-form"
      onSubmit={(e) => {
        e.preventDefault();
        useLibrary.getState().renamePlaylist(playlistId, title);
        onDone();
      }}
    >
      <div className="link-form__row">
        <input
          ref={inputRef}
          className="link-form__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="재생목록 이름"
          maxLength={100}
        />
        <button type="submit" className="btn btn--primary">
          저장
        </button>
      </div>
    </form>
  );
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  const setDialog = useUi((s) => s.setDialog);
  const close = () => setDialog(null);
  if (!dialog) return null;

  switch (dialog.type) {
    case 'addLink':
      return (
        <Modal title="재생목록 링크 열기" onClose={close}>
          <p className="modal__desc">
            YouTube Music 재생목록이나 앨범 링크를 붙여넣으세요. 연 재생목록은 사이드바에 등록됩니다. YouTube 재생목록 링크도 사용할 수 있어요.
          </p>
          <LinkForm autoFocus onDone={close} />
        </Modal>
      );
    case 'newPlaylist':
      return (
        <Modal title="새 재생목록" onClose={close}>
          <NewPlaylistForm tracks={dialog.tracks} suggestedTitle={dialog.suggestedTitle} onDone={close} />
        </Modal>
      );
    case 'saveTo':
      return (
        <Modal title="재생목록에 저장" onClose={close}>
          <SaveToPlaylist tracks={dialog.tracks} suggestedTitle={dialog.suggestedTitle} onDone={close} />
        </Modal>
      );
    case 'rename':
      return (
        <Modal title="재생목록 이름 바꾸기" onClose={close}>
          <RenameForm playlistId={dialog.playlistId} onDone={close} />
        </Modal>
      );
    case 'confirmDelete':
      return (
        <Modal title="재생목록 삭제" onClose={close}>
          <ConfirmDelete playlistId={dialog.playlistId} afterDelete={dialog.afterDelete} onDone={close} />
        </Modal>
      );
  }
}
