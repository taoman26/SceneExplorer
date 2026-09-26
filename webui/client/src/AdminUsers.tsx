import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import * as api from './api';
import { useAuth } from './auth';
import { fmtDate } from './format';

const ROLE_LABEL: Record<api.User['role'], string> = { admin: '管理者', user: '一般', viewer: '閲覧のみ' };
const ROLES = Object.keys(ROLE_LABEL) as api.User['role'][];

function message(e: unknown): string {
  if (e instanceof api.ApiError) {
    if (e.message && e.message !== e.code) return e.message;
    if (e.status === 403) return 'この操作には管理者権限が必要です';
    if (e.status === 404) return 'ユーザーが見つかりません(すでに削除された可能性があります)';
  }
  return '操作に失敗しました';
}

export default function AdminUsers() {
  const { user: me, signOut, refresh } = useAuth();
  const [users, setUsers] = useState<api.AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState<{ id: number; mode: 'pw' | 'del' } | null>(null);

  const load = useCallback(async () => {
    try { setUsers(await api.listUsers()); } catch (e) {
      if (e instanceof api.ApiError && e.status === 401) void refresh(); else setError(message(e));
    }
  }, [refresh]);
  useEffect(() => { void load(); }, [load]);

  // Runs one action, then reloads the list; shows either a success notice or the server's message.
  async function run(action: () => Promise<unknown>, ok: string) {
    setError(null); setNotice(null);
    try { await action(); setNotice(ok); setRow(null); await load(); } catch (e) { setError(message(e)); await load(); }
  }

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="logo">▶ <span>SceneExplorer</span></div>
        <Link className="btn" to="/">← ライブラリ</Link>
        <div className="usermenu" style={{ marginLeft: 'auto' }}>
          <button onClick={() => void signOut()}>{me?.username}(ログアウト)</button>
        </div>
      </header>
      <main className="admin-content">
        <div className="page-title">
          <h2>ユーザー管理</h2>
          <button className="primary" style={{ marginLeft: 'auto' }} onClick={() => setAdding((v) => !v)}>＋ ユーザーを追加</button>
        </div>
        {adding && <AddUser onCancel={() => setAdding(false)}
          onCreate={(u, p, r) => run(() => api.createUser(u, p, r).then(() => setAdding(false)), `ユーザー「${u}」を作成しました`)} />}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}
        <table className="users">
          <thead><tr><th>ユーザー名</th><th>権限</th><th>最終ログイン</th><th /></tr></thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id}>
                  <td className="uname">{u.username}{self && <span className="self">(あなた)</span>}</td>
                  <td>
                    <select aria-label={`${u.username} の権限`} value={u.role}
                      onChange={(e) => void run(() => api.updateUser(u.id, { role: e.target.value as api.User['role'] }), `「${u.username}」の権限を変更しました`)}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="muted">{u.last_login ? fmtDate(u.last_login) : '—'}</td>
                  <td className="actions">
                    {row?.id === u.id && row.mode === 'pw' ? (
                      <PasswordForm name={u.username} onCancel={() => setRow(null)}
                        onSave={(p) => run(() => api.updateUser(u.id, { password: p }), `「${u.username}」のパスワードを変更しました`)} />
                    ) : row?.id === u.id && row.mode === 'del' ? (
                      <span className="confirm" role="alertdialog" aria-label="ユーザー削除の確認">
                        「{u.username}」を削除しますか?
                        <button className="danger" onClick={() => void run(() => api.removeUser(u.id), `「${u.username}」を削除しました`)}>削除する</button>
                        <button onClick={() => setRow(null)}>キャンセル</button>
                      </span>
                    ) : (
                      <>
                        <button onClick={() => setRow({ id: u.id, mode: 'pw' })}>PW変更</button>
                        <button className="danger" disabled={self} title={self ? '自分自身は削除できません' : undefined}
                          onClick={() => setRow({ id: u.id, mode: 'del' })}>削除</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
    </div>
  );
}

function PasswordForm({ name, onSave, onCancel }: { name: string; onSave: (p: string) => void; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  return (
    <form className="inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); onSave(pw); }}>
      <input type="password" autoFocus minLength={8} required placeholder="新しいパスワード(8文字以上)" autoComplete="new-password"
        aria-label={`${name} の新しいパスワード`} value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="primary" type="submit">保存</button>
      <button type="button" onClick={onCancel}>キャンセル</button>
    </form>
  );
}

function AddUser({ onCreate, onCancel }: { onCreate: (u: string, p: string, r: api.User['role']) => void; onCancel: () => void }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [r, setR] = useState<api.User['role']>('user');
  return (
    <form className="add-user" onSubmit={(e) => { e.preventDefault(); onCreate(u, p, r); }}>
      <div><label htmlFor="nu">ユーザー名</label><input id="nu" required autoFocus autoComplete="off" value={u} onChange={(e) => setU(e.target.value)} /></div>
      <div><label htmlFor="np">パスワード(8文字以上)</label><input id="np" type="password" required minLength={8} autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} /></div>
      <div><label htmlFor="nr">権限</label>
        <select id="nr" value={r} onChange={(e) => setR(e.target.value as api.User['role'])}>
          {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
        </select></div>
      <div className="add-actions"><button className="primary" type="submit">作成</button><button type="button" onClick={onCancel}>キャンセル</button></div>
    </form>
  );
}
