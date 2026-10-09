import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MdArrowBack, MdClose, MdHistory, MdNorthWest, MdSearch } from 'react-icons/md';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Card } from '../../shared/types';
import { parseLink, targetToPath } from '../../shared/links';
import { api } from '../lib/api';
import { useLibrary } from '../store/library';
import { openCard } from './Cards';
import { IconButton } from './IconButton';
import { Thumb } from './Thumb';

type Option = { type: 'query'; text: string; history?: boolean } | { type: 'card'; card: Card };

export function SearchBox({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const initial = location.pathname === '/search' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ queries: string[]; items: Card[] }>({ queries: [], items: [] });
  const searches = useLibrary((s) => s.searches);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setValue(initial), [initial]);

  // 추천 검색어 (디바운스)
  useEffect(() => {
    const q = value.trim();
    if (!q || parseLink(q)) {
      setRemote({ queries: [], items: [] });
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .suggestions(q, ctrl.signal)
        .then(setRemote)
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  // '/' 단축키로 검색창 포커스
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener('om:focus-search', onFocus);
    return () => window.removeEventListener('om:focus-search', onFocus);
  }, []);

  const q = value.trim();
  const history = searches.filter((s) => !q || s.toLowerCase().includes(q.toLowerCase())).slice(0, q ? 3 : 8);
  const options: Option[] = [
    ...history.map((text) => ({ type: 'query' as const, text, history: true })),
    ...remote.queries.filter((x) => !history.includes(x)).map((text) => ({ type: 'query' as const, text })),
    ...remote.items.map((card) => ({ type: 'card' as const, card })),
  ];

  const submit = (text: string) => {
    const query = text.trim();
    if (!query) return;
    setOpen(false);
    inputRef.current?.blur();
    onClose?.();
    const link = parseLink(query);
    if (link) {
      navigate(targetToPath(link));
      return;
    }
    useLibrary.getState().addSearch(query);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const choose = (opt: Option) => {
    if (opt.type === 'query') submit(opt.text);
    else {
      setOpen(false);
      onClose?.();
      openCard(opt.card, navigate);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && options[active]) choose(options[active]);
      else submit(value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      onClose?.();
    }
  };

  return (
    <div className={`search ${open ? 'search--open' : ''}`} ref={boxRef}>
      <div className="search__field">
        {onClose ? (
          <IconButton label="뒤로" onClick={onClose}>
            <MdArrowBack />
          </IconButton>
        ) : (
          <IconButton label="검색" onClick={() => submit(value)}>
            <MdSearch />
          </IconButton>
        )}
        <input
          ref={inputRef}
          value={value}
          autoFocus={!!onClose}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="노래, 앨범, 아티스트 검색 또는 링크 붙여넣기"
          aria-label="검색"
          spellCheck={false}
        />
        {value && (
          <IconButton
            label="지우기"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
          >
            <MdClose />
          </IconButton>
        )}
      </div>
      {open && (parseLink(q) || options.length > 0) && (
        <div className="search__dropdown" role="listbox">
          {parseLink(q) && (
            <button type="button" className="search__option search__option--link" onClick={() => submit(q)}>
              <MdNorthWest className="search__option-icon" />
              <span>링크 열기</span>
            </button>
          )}
          {options.map((opt, i) =>
            opt.type === 'query' ? (
              <div key={`q-${opt.text}`} className={`search__option ${i === active ? 'search__option--active' : ''}`}>
                <button type="button" className="search__option-main" onClick={() => choose(opt)}>
                  {opt.history ? <MdHistory className="search__option-icon" /> : <MdSearch className="search__option-icon" />}
                  <span className="search__option-text">{opt.text}</span>
                </button>
                {opt.history ? (
                  <button type="button" className="search__option-remove" onClick={() => useLibrary.getState().removeSearch(opt.text)}>
                    삭제
                  </button>
                ) : (
                  <IconButton label="검색어 채우기" size="sm" onClick={() => { setValue(opt.text); inputRef.current?.focus(); }}>
                    <MdNorthWest />
                  </IconButton>
                )}
              </div>
            ) : (
              <button
                key={`c-${opt.card.id}`}
                type="button"
                className={`search__option search__option--card ${i === active ? 'search__option--active' : ''}`}
                onClick={() => choose(opt)}
              >
                <Thumb src={opt.card.thumbnail} size={40} round={opt.card.kind === 'artist'} className="search__card-thumb" />
                <span className="search__card-text">
                  <span className="search__card-title">{opt.card.title}</span>
                  {opt.card.subtitle && <span className="search__card-sub">{opt.card.subtitle}</span>}
                </span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
