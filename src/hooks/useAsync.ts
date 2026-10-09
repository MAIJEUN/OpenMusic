import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  loading: boolean;
  data?: T;
  error?: string;
}

/** deps가 바뀔 때마다 fn을 실행하고 결과를 상태로 돌려준다 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fn()
      .then((data) => alive && setState({ loading: false, data }))
      .catch((err: Error) => alive && setState({ loading: false, error: err.message }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
