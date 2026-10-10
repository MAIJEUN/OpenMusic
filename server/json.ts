/** InnerTube 응답 JSON 탐색 도우미 (구조가 자주 바뀌어서 경로 대신 키 이름으로 찾는다) */

function walk(root: unknown, key: string, onFound: (v: any) => boolean) {
  const stack: unknown[] = [root];
  let guard = 0;
  while (stack.length && guard++ < 300_000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    const obj = node as Record<string, unknown>;
    if (key in obj && onFound(obj[key])) return;
    const vals = Object.values(obj);
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] && typeof vals[i] === 'object') stack.push(vals[i]);
  }
}

/** key를 가진 첫 번째 값 */
export function findKey(root: unknown, key: string): any {
  let found: any;
  walk(root, key, (v) => ((found = v), true));
  return found;
}

/** key를 가진 모든 값 (문서 순서) */
export function findAll(root: unknown, key: string): any[] {
  const out: any[] = [];
  walk(root, key, (v) => (out.push(v), false));
  return out;
}
