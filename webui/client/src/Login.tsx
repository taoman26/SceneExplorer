import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import * as api from './api';
import { useAuth } from './auth';

function messageFor(e: unknown, setupMode: boolean): string {
  if (e instanceof api.ApiError) {
    if (e.status === 401) return 'ユーザー名またはパスワードが違います';
    if (e.status === 429) return `試行回数が多すぎます。${Math.ceil((e.retryAfter ?? 300) / 60)}分ほど待ってから再試行してください`;
    if (e.status === 400 && e.message) return e.message;
    if (e.status === 409) return '管理者アカウントはすでに作成されています。ページを再読み込みしてください';
  }
  return setupMode ? '管理者アカウントを作成できませんでした' : 'サインインできませんでした';
}

export default function Login() {
  const { needsSetup, user, refresh } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (needsSetup ? api.setup : api.login)(username, password);
      await refresh();
    } catch (err) {
      setError(messageFor(err, needsSetup));
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>▶ SceneExplorer</h1>
        <p className="sub">
          {needsSetup ? '最初に管理者アカウントを作成します' : 'サインインして動画ライブラリを開く'}
        </p>
        <div className="field">
          <label htmlFor="username">ユーザー名</label>
          <input id="username" name="username" autoComplete="username" autoFocus required
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">パスワード{needsSetup && '(8文字以上)'}</label>
          <input id="password" name="password" type="password" required
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {needsSetup ? '管理者アカウントを作成' : 'サインイン'}
        </button>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {!needsSetup && <p className="hint">初回起動時は管理者アカウントの作成画面が表示されます</p>}
      </form>
    </main>
  );
}
