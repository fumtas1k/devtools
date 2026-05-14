// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

// `@/utils/jwt-verify` を mock 化し、`verifySignature` を controllable promise に差し替える。
// JwtDecoderTool は `verifySignature` を ESM import 経由で参照するため (本 PR で
// `src/utils/jwt-verify.ts` に切り出し)、vi.mock で差し替えが効く。
vi.mock('@/utils/jwt-verify', () => {
  return {
    ALG_MAP: {},
    verifySignature: vi.fn(),
  };
});

import { JwtDecoderTool } from '@/components/tools/JwtDecoder';
import { verifySignature } from '@/utils/jwt-verify';

// 構造的に valid (3 セグメント / 各セグメントが base64url な JSON) な HS256 JWT。
// 署名検証は mock するため値は何でもよい。
const VALID_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.dummy';

beforeEach(() => {
  vi.mocked(verifySignature).mockReset();
});

afterEach(() => {
  cleanup();
});

// ────────────────────────────────────────────
// #389: cancellation flag が stale promise の setSigStatus を抑止する
// ────────────────────────────────────────────
describe('JwtDecoderTool — verifySignature の stale promise race を cleanup で抑止する (issue #389)', () => {
  it('古い verifySignature の resolve は新しい呼び出し後に届いても badge を上書きしない', async () => {
    // 各 verify 呼び出しを controllable な promise に差し替える。
    // call 1 (古い) は意図的に call 2 より後に resolve させる。
    const resolvers: Array<(value: 'valid' | 'invalid') => void> = [];
    vi.mocked(verifySignature).mockImplementation(() => {
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    });

    render(<JwtDecoderTool />);

    // 1. valid な JWT を入力 → parsed != null になり secretKey 入力欄が表示される
    const tokenInput = screen.getByLabelText('JWTトークンを貼り付け') as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(tokenInput, { target: { value: VALID_JWT } });
    });

    // 2. secretKey を 'first' に設定 → useEffect が verify 呼び出し (call 1)
    const secretInput = (await screen.findByLabelText(/シークレットキー/)) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(secretInput, { target: { value: 'first' } });
    });
    await waitFor(() => expect(resolvers.length).toBe(1));

    // 3. secretKey を 'second' に変更 → cleanup が走り cancelled=true、続いて verify (call 2)
    act(() => {
      fireEvent.change(secretInput, { target: { value: 'second' } });
    });
    await waitFor(() => expect(resolvers.length).toBe(2));

    // 4. 新しい呼び出し (call 2) を先に 'invalid' で resolve
    await act(async () => {
      resolvers[1]('invalid');
    });

    // この時点で badge は '署名: 無効'
    expect(screen.getByText('署名: 無効')).toBeTruthy();

    // 5. 遅れて古い呼び出し (call 1) が 'valid' で resolve。
    //    cancellation flag が機能していれば setSigStatus は呼ばれず、badge は変化しない。
    //    旧実装 (cleanup なし) ではここで '署名: 有効' に上書きされて test fail する。
    await act(async () => {
      resolvers[0]('valid');
    });

    expect(screen.getByText('署名: 無効')).toBeTruthy();
    expect(screen.queryByText('署名: 有効')).toBeNull();
  });
});
