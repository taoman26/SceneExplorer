import { useState } from 'react';
import { thumbUrl, type TagInfo, type Video } from './api';
import { fmtDuration, fmtSize } from './format';

export default function VideoCard({ video, tags, onOpen }: {
  video: Video; tags: Map<number, TagInfo>; onOpen?: (v: Video) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <article className="card" tabIndex={0} onClick={() => onOpen?.(video)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen?.(video); }}>
      <div className="thumb">
        {broken
          ? <div className="thumb-missing">No image</div>
          : <img src={thumbUrl(video.id, 1)} alt="" loading="lazy" onError={() => setBroken(true)} />}
        <span className="badge">{fmtDuration(video.duration)}</span>
      </div>
      <h3 className="card-title" title={video.name}>{video.name}</h3>
      <div className="card-meta">
        {video.width}×{video.height} · {fmtSize(video.size)} · {video.vcodec}
      </div>
      {video.tagids.length > 0 && (
        <div className="chips">
          {video.tagids.map((id) => tags.get(id)).filter((t): t is TagInfo => !!t)
            .map((t) => <span className="chip" key={t.tagid}>{t.tag}</span>)}
        </div>
      )}
    </article>
  );
}
