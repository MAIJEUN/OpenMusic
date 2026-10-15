import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MdAdd, MdClose } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { parseLink, targetToPath } from '../../shared/links';
import type { Track } from '../../shared/types';
import { localInfo, useLibrary, type CollectionInfo } from '../store/library';
import { deleteLocalPlaylist } from './menus';
import { toast, useUi, type LinkedEdit } from '../store/ui';
import { useSpectrumState } from '../player/useSpectrum';
import { gainDb, loudnessOf, normalizeMode, onLoudness, type NormalizeMode } from '../player/useLoudness';
import { usePlayer } from '../store/player';
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
      setError('YouTube Music · YouTube · Spotify · SoundCloud 재생목록이나 곡 링크를 입력해 주세요.');
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
          placeholder="YouTube Music · Spotify · SoundCloud 링크"
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

/** 링크로 가져온 재생목록 → 내 재생목록 복사 (하려던 수정이 있으면 복사본에 바로 적용) */
function CopyLinked({
  collection,
  getTracks,
  edit,
  onDone,
}: {
  collection: CollectionInfo;
  getTracks: () => Promise<Track[]>;
  edit?: LinkedEdit;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => okRef.current?.focus(), []);
  const isAlbum = collection.kind === 'album';

  const copy = async () => {
    setBusy(true);
    let tracks: Track[];
    try {
      tracks = await getTracks();
    } catch (err) {
      setBusy(false);
      toast(`곡 목록을 불러오지 못했습니다. ${(err as Error).message}`);
      return;
    }
    const lib = useLibrary.getState();
    const id = lib.createPlaylist(collection.title, tracks);
    // 하려던 수정을 복사본에 적용
    if (edit?.type === 'remove') lib.removeFromPlaylist(id, edit.videoId);
    if (edit?.type === 'move') {
      const list = useLibrary.getState().playlists.find((p) => p.id === id)?.tracks ?? [];
      const from = list.findIndex((t) => t.videoId === edit.videoId);
      const to = list.findIndex((t) => t.videoId === edit.targetVideoId);
      if (from >= 0 && to >= 0) lib.movePlaylistTrack(id, from, to);
    }
    onDone();
    navigate(`/playlist?list=${encodeURIComponent(id)}`);
    const done =
      edit?.type === 'remove' ? ` '${edit.title}'을(를) 뺐어요.` : edit?.type === 'move' ? ` '${edit.title}'의 순서를 바꿨어요.` : '';
    toast(`'${collection.title}'을(를) 내 재생목록으로 복사했어요.${done}`);
    if (edit?.type === 'rename') useUi.getState().setDialog({ type: 'rename', playlistId: id });
  };

  const what = isAlbum ? '앨범' : '재생목록';
  const editText =
    edit?.type === 'remove'
      ? `복사본에서는 '${edit.title}'을(를) 바로 빼 드릴게요.`
      : edit?.type === 'move'
        ? `복사본에서는 '${edit.title}'의 순서를 바로 바꿔 드릴게요.`
        : edit?.type === 'rename'
          ? '복사한 뒤 바로 이름을 바꿀 수 있어요.'
          : '';
  return (
    <div className="confirm">
      <div className="confirm__target">
        <CollectionArt info={collection} size={56} className="confirm__art" />
        <div className="confirm__text">
          <div className="confirm__title">{collection.title}</div>
          <div className="confirm__sub">{collection.subtitle ?? `링크로 가져온 ${what}`}</div>
        </div>
      </div>
      <p className="modal__desc">
        {edit ? `링크로 가져온 ${what}은 원본을 그대로 보여주기 때문에 이곳에서 수정할 수 없어요. ` : ''}
        내 재생목록으로 복사하면 곡 추가·삭제, 순서 변경, 이름 바꾸기를 자유롭게 할 수 있어요. {editText}
        <br />
        <span className="modal__note">복사본에는 이후 원본의 변경 사항이 반영되지 않아요.</span>
      </p>
      <div className="confirm__actions">
        <button type="button" className="btn btn--outline" onClick={onDone} disabled={busy}>
          취소
        </button>
        <button ref={okRef} type="button" className="btn btn--primary" onClick={copy} disabled={busy}>
          {busy ? '복사하는 중…' : edit ? '복사해서 수정하기' : '복사하기'}
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

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'switch--on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch__knob" />
    </button>
  );
}

/** 재생 설정: 크로스페이드, 노래가 아닌 구간 건너뛰기, 곡 끝 무음 건너뛰기 */
const NORMALIZE_OPTIONS: { id: NormalizeMode; label: string }[] = [
  { id: 'off', label: '끄기' },
  { id: 'normal', label: '보통' },
  { id: 'strong', label: '강하게' },
];

/** 지금 곡의 볼륨 균형 조정 상태 */
function NormalizeStatus({ mode }: { mode: NormalizeMode }) {
  const playingId = usePlayer((s) => s.playingId);
  const [, force] = useState(0);
  useEffect(() => {
    const off = onLoudness(() => force((n) => n + 1));
    return () => void off();
  }, []);
  if (!playingId || mode === 'off') return null;
  const l = loudnessOf(playingId);
  const db = gainDb(playingId, l, mode);
  const source = l === undefined ? '음량 확인 중' : l ? `음량 ${l.loudness.toFixed(1)} LUFS` : '음량 정보 없음 (평균 곡 기준)';
  return (
    <div className="settings__status">
      지금 곡: {source} → {db < -0.05 ? `${db.toFixed(1)}dB 줄임` : '그대로'}
    </div>
  );
}

function PlaybackSettingsForm() {
  const playback = useUi((s) => s.playback);
  const set = useUi((s) => s.setPlayback);
  const spectrumOn = useSpectrumState() === 'on';
  const mode = normalizeMode(playback);
  return (
    <div className="settings">
      <div className="settings__row">
        <div className="settings__text">
          <div className="settings__title">볼륨 균형 조정</div>
          <div className="settings__desc">
            곡마다 다른 음량을 맞춰서 볼륨을 계속 만지지 않아도 되게 합니다. 볼륨을 키울 수는 없어서 큰 곡을 조용한 곡에 맞춰 줄이며, &lsquo;강하게&rsquo;는 더 고르게 맞추는 대신 전체 소리가 조금 작아집니다.
          </div>
        </div>
      </div>
      <div className="segmented" role="radiogroup" aria-label="볼륨 균형 조정">
        {NORMALIZE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={mode === o.id}
            className={`segmented__item ${mode === o.id ? 'segmented__item--on' : ''}`}
            onClick={() => set({ normalize: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <NormalizeStatus mode={mode} />

      <div className="settings__row">
        <div className="settings__text">
          <div className="settings__title">크로스페이드</div>
          <div className="settings__desc">곡이 끝나갈 때 다음 곡과 자연스럽게 겹쳐서 넘어갑니다.</div>
        </div>
        <span className="settings__value">{playback.crossfade ? `${playback.crossfade}초` : '끔'}</span>
      </div>
      <input
        type="range"
        className="settings__range"
        min={0}
        max={12}
        step={1}
        value={playback.crossfade}
        onChange={(e) => set({ crossfade: Number(e.target.value) })}
        aria-label="크로스페이드 길이"
        style={{ ['--val' as string]: `${(playback.crossfade / 12) * 100}%` }}
      />

      <div className="settings__row">
        <div className="settings__text">
          <div className="settings__title">노래가 아닌 구간 건너뛰기</div>
          <div className="settings__desc">
            뮤직비디오의 인트로·아웃트로·영상 끝 엔딩 화면처럼 노래가 아닌 부분을 건너뜁니다. (SponsorBlock 공개 데이터, 등록된 곡만)
          </div>
        </div>
        <Switch checked={playback.skipNonMusic} onChange={(v) => set({ skipNonMusic: v })} label="노래가 아닌 구간 건너뛰기" />
      </div>

      <div className="settings__row">
        <div className="settings__text">
          <div className="settings__title">곡 끝 무음 건너뛰기</div>
          <div className="settings__desc">
            곡 후반에 소리 없는 구간이 정한 시간 이상 이어지면 다음 곡으로 넘어갑니다.{' '}
            {spectrumOn ? '(실시간 스펙트럼 켜짐 · 동작 중)' : '실시간 스펙트럼(재생 바의 파형 버튼)이 켜져 있을 때만 동작해요.'}
          </div>
        </div>
        <Switch checked={playback.skipSilence} onChange={(v) => set({ skipSilence: v })} label="곡 끝 무음 건너뛰기" />
      </div>
      <div className={`settings__sub ${playback.skipSilence ? '' : 'settings__sub--off'}`}>
        <div className="settings__row settings__row--tight">
          <div className="settings__text">
            <div className="settings__label">무음 시간</div>
          </div>
          <span className="settings__value">{playback.silenceSeconds}초</span>
        </div>
        <input
          type="range"
          className="settings__range"
          min={1}
          max={10}
          step={0.5}
          value={playback.silenceSeconds}
          disabled={!playback.skipSilence}
          onChange={(e) => set({ silenceSeconds: Number(e.target.value) })}
          aria-label="무음 시간"
          style={{ ['--val' as string]: `${((playback.silenceSeconds - 1) / 9) * 100}%` }}
        />
      </div>

    </div>
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
            YouTube Music 재생목록이나 앨범 링크를 붙여넣으세요. 연 재생목록은 사이드바에 등록됩니다. YouTube, Spotify(재생목록·앨범·곡), SoundCloud(곡·재생목록·아티스트) 링크도 사용할 수 있어요.
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
    case 'copyLinked':
      return (
        <Modal title={dialog.edit ? '링크로 가져온 재생목록은 수정할 수 없어요' : '내 재생목록으로 복사'} onClose={close}>
          <CopyLinked collection={dialog.collection} getTracks={dialog.getTracks} edit={dialog.edit} onDone={close} />
        </Modal>
      );
    case 'rename':
      return (
        <Modal title="재생목록 이름 바꾸기" onClose={close}>
          <RenameForm playlistId={dialog.playlistId} onDone={close} />
        </Modal>
      );
    case 'settings':
      return (
        <Modal title="재생 설정" onClose={close}>
          <PlaybackSettingsForm />
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
