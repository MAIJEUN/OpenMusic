/**
 * 자막 ID 맞추기.
 * 가사 탭(서버의 자막 목록)과 동영상 플레이어(IFrame 자막 목록)는 같은 자막을 조금 다르게 부를 수 있어서
 * ID가 정확히 같지 않으면 '같은 언어 + 같은 종류(직접 만든/자동 생성)'로 맞춘다.
 * ID 형식: .ko(직접 만든 자막), a.ko(자동 생성), .en.이름(이름 붙은 자막)
 */
function parse(id: string) {
  const auto = id.startsWith('a.');
  const lang = id.replace(/^a?\./, '').split('.')[0].toLowerCase();
  return { auto, lang };
}

export function matchCaption<T>(list: T[], want: string | undefined, idOf: (t: T) => string): T | undefined {
  if (!want) return undefined;
  const exact = list.find((t) => idOf(t) === want);
  if (exact) return exact;
  const w = parse(want);
  const same = (t: T, norm: (l: string) => string) => {
    const p = parse(idOf(t));
    return p.auto === w.auto && norm(p.lang) === norm(w.lang);
  };
  return list.find((t) => same(t, (l) => l)) ?? list.find((t) => same(t, (l) => l.split('-')[0]));
}
