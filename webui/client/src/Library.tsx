import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from './api';
import { useAuth } from './auth';
import { dirLabel } from './format';
import Sidebar, { type Filter } from './Sidebar';
import VideoCard from './VideoCard';
import VideoDetail from './VideoDetail';

const SORTS: [string, string][] = [
  ['wtime', '更新日時'], ['name', '名前'], ['size', 'サイズ'],
  ['duration', '長さ'], ['opencount', '再生回数'], ['lastaccess', '最終再生'],
];
const PAGE_SIZE = 48;

export default function Library() {
  const { user, signOut, refresh } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [dirs, setDirs] = useState<api.Dir[]>([]);
  const [tagList, setTagList] = useState<api.TagList | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [list, setList] = useState<api.VideoList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirmDel, setConfirmDel] = useState(false);
  const [tagDelError, setTagDelError] = useState<string | null>(null);
  const canEdit = user?.role !== 'viewer';

  const filter: Filter = {
    dir: sp.get('dir'), tag: sp.get('tag'), untagged: sp.get('untagged') === '1', missing: sp.get('missing') === '1',
  };
  const q = sp.get('q') ?? '';
  const sort = SORTS.some(([k]) => k === sp.get('sort')) ? sp.get('sort')! : 'wtime';
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc';
  const openId = sp.get('v') ? Number(sp.get('v')) : null;
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);

  // URL is the single source of truth for the view state (shareable, survives reload).
  const update = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
      if (resetPage) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSp]);

  const closeDetail = useCallback(() => update({ v: null }, false), [update]);

  const fail = useCallback((e: unknown) => {
    if (e instanceof api.ApiError && e.status === 401) { void refresh(); return; }
    setError(e instanceof api.ApiError && e.code === 'library_unavailable'
      ? 'ライブラリのデータベースが見つかりません。SceneExplorer でフォルダを追加してスキャンを実行してください。'
      : '読み込みに失敗しました。再読み込みしてください。');
  }, [refresh]);

  useEffect(() => {
    api.listDirs().then(setDirs).catch(fail);
    api.listTags().then(setTagList).catch(fail);
    api.listVideos(new URLSearchParams({ size: '1' })).then((r) => setTotal(r.total)).catch(fail);
  }, [fail, reload]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ sort, order, page: String(page), size: String(PAGE_SIZE) });
    if (q) p.set('q', q);
    if (filter.dir) p.set('dir', filter.dir);
    if (filter.tag) p.set('tag', filter.tag);
    if (filter.untagged) p.set('untagged', '1');
    if (filter.missing) p.set('missing', '1');
    return p.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order, page, q, filter.dir, filter.tag, filter.untagged, filter.missing]);

  useEffect(() => {
    let stale = false; // ignore out-of-order responses
    setError(null);
    setLoading(true);
    api.listVideos(new URLSearchParams(params)).then((r) => { if (!stale) { setList(r); setLoading(false); } })
      .catch((e) => { if (!stale) { fail(e); setLoading(false); } });
    return () => { stale = true; };
  }, [params, fail, reload]);

  // Search box: local text, pushed to the URL 300ms after typing stops.
  const [qInput, setQInput] = useState(q);
  const lastQ = useRef(q);
  useEffect(() => { if (q !== lastQ.current) { lastQ.current = q; setQInput(q); } }, [q]);
  useEffect(() => {
    if (qInput === lastQ.current) return;
    const t = setTimeout(() => { lastQ.current = qInput; update({ q: qInput }); }, 300);
    return () => clearTimeout(t);
  }, [qInput, update]);

  const tagMap = useMemo(() => new Map((tagList?.tags ?? []).map((t) => [t.tagid, t])), [tagList]);
  const pages = list ? Math.max(1, Math.ceil(list.total / list.size)) : 1;
  const shownPage = list?.page ?? page; // what is actually on screen, not what was just requested

  const title = filter.missing ? '欠損ファイル'
    : filter.untagged ? 'タグなし'
    : filter.tag ? `# ${tagMap.get(Number(filter.tag))?.tag ?? ''}`
    : filter.dir ? (() => { const d = dirs.find((x) => String(x.id) === filter.dir); return d ? dirLabel(d) : ''; })()
    : 'すべて';

  function goPage(p: number) {
    update({ page: p === 1 ? null : String(p) }, false);
    window.scrollTo(0, 0);
    document.querySelector('.content')?.scrollTo(0, 0);
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-label="メニュー" onClick={() => setDrawer((v) => !v)}>☰</button>
        <div className="logo">▶ <span>SceneExplorer</span></div>
        <input className="search" type="search" placeholder="タイトルを検索…" aria-label="タイトルを検索"
          value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <div className="sortbox">
          <label htmlFor="sort">並び順:</label>
          <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value })}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="order-btn" aria-label={order === 'desc' ? '降順' : '昇順'}
            onClick={() => update({ order: order === 'desc' ? 'asc' : null })}>{order === 'desc' ? '↓' : '↑'}</button>
        </div>
        <div className="usermenu">
          <button onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>{user?.username}</button>
          {menu && (
            <div className="menu" role="menu">
              {user?.role === 'admin' && <Link role="menuitem" className="menu-link" to="/admin/users" onClick={() => setMenu(false)}>ユーザー管理</Link>}
              <button role="menuitem" onClick={() => void signOut()}>ログアウト</button>
            </div>
          )}
        </div>
      </header>

      <Sidebar dirs={dirs} tags={tagList} total={total} filter={filter} open={drawer}
        onSelect={(f) => {
          setDrawer(false);
          update({ dir: f.dir ?? null, tag: f.tag ?? null, untagged: f.untagged ? '1' : null, missing: f.missing ? '1' : null });
        }} />
      {drawer && <div className="backdrop" onClick={() => setDrawer(false)} />}

      <main className="content">
        <div className="page-title">
          <h2>{title}</h2>
          {list && <span className="count">{list.total} 件</span>}
          {canEdit && filter.tag && !confirmDel && (
            <button className="link-btn" onClick={() => { setConfirmDel(true); setTagDelError(null); }}>このタグを削除</button>
          )}
          {confirmDel && filter.tag && (
            <span className="confirm" role="alertdialog" aria-label="タグの削除の確認">
              「{tagMap.get(Number(filter.tag))?.tag}」を削除しますか?(動画は削除されません)
              <button className="danger" onClick={() => {
                api.deleteTag(Number(filter.tag)).then(() => {
                  setConfirmDel(false); update({ tag: null }); setReload((n) => n + 1);
                }).catch(() => setTagDelError('タグを削除できませんでした'));
              }}>削除する</button>
              <button onClick={() => setConfirmDel(false)}>キャンセル</button>
            </span>
          )}
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {tagDelError && <div className="error-banner" role="alert">{tagDelError}</div>}
        {list && list.items.length === 0 && !error && (
          <p className="empty">{q ? `「${q}」に一致する動画はありません` : '動画がありません'}</p>
        )}
        <div className={`grid${loading ? ' loading' : ''}`} aria-busy={loading}>
          {list?.items.map((v) => <VideoCard key={v.id} video={v} tags={tagMap} onOpen={(x) => update({ v: String(x.id) }, false)} />)}
        </div>
        {list && list.total > list.size && (
          <div className="pager">
            <button disabled={loading || shownPage <= 1} onClick={() => goPage(shownPage - 1)}>‹ 前</button>
            <span>{shownPage} / {pages}</span>
            <button disabled={loading || shownPage >= pages} onClick={() => goPage(shownPage + 1)}>次 ›</button>
          </div>
        )}
      </main>
      {openId !== null && <VideoDetail id={openId} tags={tagList?.tags ?? []} canEdit={canEdit} onClose={closeDetail}
        onTagsChanged={() => setReload((n) => n + 1)} />}
    </div>
  );
}
