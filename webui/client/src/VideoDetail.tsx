import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as api from './api';
import { fmtBitrate, fmtClock, fmtDate, fmtDuration, fmtSize, thumbTime } from './format';

function tagErrorMessage(e: unknown): string {
  if (e instanceof api.ApiError) {
    if (e.status === 403) return 'タグを編集する権限がありません';
    if (e.code === 'library_busy') return 'ライブラリが使用中です。少し待ってからもう一度お試しください';
    if (e.code === 'library_readonly') return 'ライブラリのファイルに書き込めません';
    if (e.code === 'invalid_tag') return e.message !== e.code ? e.message : 'タグ名が正しくありません';
  }
  return 'タグを更新できませんでした';
}

// A browser cannot launch a local application, so this downloads a one-entry .m3u playlist carrying a
// short-lived, video-scoped play token (see webui/schema.md "Play tokens"). If .m3u is associated with VLC
// (a common default on Windows/macOS installs) the OS opens it there; otherwise the user opens it by hand.
function downloadPlaylist(url: string, title: string) {
  const safeName = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.[^.]*$/, '') || 'video';
  const m3u = `#EXTM3U\n#EXTINF:-1,${title.replace(/[\r\n]/g, ' ')}\n${url}\n`;
  const blobUrl = URL.createObjectURL(new Blob([m3u], { type: 'application/x-mpegurl' }));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${safeName}.m3u`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function vlcErrorMessage(e: unknown): string {
  if (e instanceof api.ApiError && e.status === 404) return '動画が見つかりません';
  return 'VLC用のプレイリストを作成できませんでした';
}

export default function VideoDetail({ id, tags, canEdit, onClose, onTagsChanged }: {
  id: number; tags: api.TagInfo[]; canEdit: boolean; onClose: () => void; onTagsChanged: () => void;
}) {
  const [tagBusy, setTagBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [vlcBusy, setVlcBusy] = useState(false);
  const [vlcError, setVlcError] = useState<string | null>(null);
  const [vlcNotice, setVlcNotice] = useState(false);
  const tagMap = new Map(tags.map((t) => [t.tagid, t]));

  async function playInVlc() {
    if (!video) return;
    setVlcBusy(true); setVlcError(null); setVlcNotice(false);
    try {
      const { url } = await api.createPlayToken(video.id);
      downloadPlaylist(url, video.name);
      setVlcNotice(true);
    } catch (e) { setVlcError(vlcErrorMessage(e)); } finally { setVlcBusy(false); }
  }

  async function applyTags(next: number[], created?: api.TagInfo) {
    if (!video) return;
    setTagBusy(true); setTagError(null);
    try {
      const r = await api.setVideoTags(video.id, next);
      setVideo({ ...video, tagids: r.tagids });
      onTagsChanged();
      return created;
    } catch (e) {
      setTagError(tagErrorMessage(e));
      if (created) onTagsChanged(); // the tag itself was created even if attaching failed
    } finally { setTagBusy(false); }
  }
  const toggleTag = (tagid: number) => {
    if (!video) return;
    void applyTags(video.tagids.includes(tagid) ? video.tagids.filter((t) => t !== tagid) : [...video.tagids, tagid]);
  };
  async function addTag(e: FormEvent) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name || !video) return;
    setTagBusy(true); setTagError(null);
    try {
      let tagid: number;
      try { tagid = (await api.createTag(name)).tagid; } catch (err) {
        if (err instanceof api.ApiError && err.code === 'tag_exists') tagid = err.tagid ?? -1; else throw err;
      }
      if (tagid < 0) throw new Error('unknown tag');
      setNewTag('');
      setTagBusy(false);
      await applyTags(video.tagids.includes(tagid) ? video.tagids : [...video.tagids, tagid], { tagid, tag: name, count: 0 });
    } catch (err) { setTagError(tagErrorMessage(err)); setTagBusy(false); }
  }

  const [video, setVideo] = useState<api.VideoDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stale = false;
    setVideo(null); setLoadError(null); setPlayError(false);
    api.getVideo(id).then((v) => { if (!stale) setVideo(v); }).catch((e) => {
      if (!stale) setLoadError(e instanceof api.ApiError && e.status === 404 ? '動画が見つかりません' : '読み込みに失敗しました');
    });
    return () => { stale = true; };
  }, [id]);

  // Esc closes, page behind doesn't scroll, focus moves into the dialog and returns afterwards.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose]);

  function seekTo(i: number) {
    const el = player.current;
    if (!el || !video) return;
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : video.duration;
    el.currentTime = thumbTime(i, video.thumbCount, dur);
    void el.play().catch(() => { /* autoplay may be refused; the user can press play */ });
  }

  const tagNames = video?.tagids.map((t) => tagMap.get(t)?.tag).filter((t): t is string => !!t) ?? [];
  const info: [string, string][] = video ? [
    ['パス', video.directory],
    ['サイズ', fmtSize(video.size)],
    ['解像度', `${video.width}×${video.height}`],
    ['長さ', fmtDuration(video.duration)],
    ['コーデック', `${video.vcodec}${video.acodec ? ` / ${video.acodec}` : ''}`],
    ['ビットレート', fmtBitrate(video.bitrate)],
    ['FPS', String(video.fps)],
    ['更新日時', fmtDate(video.wtime)],
    ['再生回数', String(video.opencount)],
  ] : [];

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={video?.name ?? '動画の詳細'} tabIndex={-1} ref={dialog}>
        <div className="modal-head">
          <h2 title={video?.name}>{video?.name ?? (loadError ? '' : '読み込み中…')}</h2>
          <button className="icon-btn" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        {loadError && <div className="error-banner" role="alert">{loadError}</div>}
        {video && (
          <div className="detail">
            <div className="detail-main">
              <div className="player">
                {video.available && !playError ? (
                  <video key={video.id} ref={player} controls preload="none" playsInline
                    poster={video.thumbCount ? api.thumbUrl(video.id, 1) : undefined}
                    src={api.streamUrl(video.id)} onError={() => setPlayError(true)} />
                ) : (
                  <div className="player-msg" role="alert">
                    {!video.available
                      ? '動画ファイルが見つかりません(ディスクが接続されていない可能性があります)'
                      : 'このブラウザでは再生できない形式です。ダウンロードして再生してください。'}
                  </div>
                )}
              </div>
              {video.thumbCount > 0 && (
                <div className="strip">
                  {Array.from({ length: video.thumbCount }, (_, k) => k + 1).map((i) => (
                    <button key={i} className="strip-item" aria-label={`${fmtClock(thumbTime(i, video.thumbCount, video.duration))} へ移動`}
                      disabled={!video.available || playError} onClick={() => seekTo(i)}>
                      <img src={api.thumbUrl(video.id, i)} alt="" loading="lazy" />
                      <span>{fmtClock(thumbTime(i, video.thumbCount, video.duration))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="detail-side">
              <dl className="info">
                {info.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                <div><dt>タグ</dt><dd>
                  {canEdit ? (
                    <>
                      <span className="chips" role="group" aria-label="タグ">
                        {tags.map((t) => {
                          const on = video.tagids.includes(t.tagid);
                          return (
                            <button key={t.tagid} type="button" className={`chip chip-btn${on ? ' on' : ''}`} aria-pressed={on}
                              disabled={tagBusy} onClick={() => toggleTag(t.tagid)}>{t.tag}</button>
                          );
                        })}
                      </span>
                      <form className="tag-add" onSubmit={(e) => void addTag(e)}>
                        <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="新しいタグ" maxLength={64}
                          aria-label="新しいタグ名" disabled={tagBusy} />
                        <button type="submit" disabled={tagBusy || !newTag.trim()}>追加</button>
                      </form>
                      {tagError && <div className="error-banner" role="alert">{tagError}</div>}
                    </>
                  ) : (tagNames.length ? <span className="chips">{tagNames.map((t) => <span className="chip" key={t}>{t}</span>)}</span> : 'なし')}
                </dd></div>
              </dl>
              <div className="detail-actions">
                <a className="btn" href={api.streamUrl(video.id, true)} download
                  aria-disabled={!video.available} onClick={(e) => { if (!video.available) e.preventDefault(); }}>ダウンロード</a>
                <button className="primary" disabled={!video.available || playError}
                  onClick={() => { const el = player.current; if (el) { void el.requestFullscreen?.(); void el.play().catch(() => {}); } }}>
                  全画面再生
                </button>
              </div>
              <div className="detail-actions">
                <button disabled={!video.available || vlcBusy} onClick={() => void playInVlc()}
                  title="ブラウザで再生できない場合に、ローカルのVLCで開きます">
                  {vlcBusy ? 'VLC用ファイルを作成中…' : 'VLCで再生'}
                </button>
              </div>
              {vlcNotice && (
                <p className="hint">
                  VLC用のプレイリストをダウンロードしました。自動で開かない場合は、ダウンロードしたファイルを手動でVLCから開いてください。
                </p>
              )}
              {vlcError && <div className="error-banner" role="alert">{vlcError}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
