import type { Dir, TagList } from './api';
import { dirLabel } from './format';

export interface Filter { dir: string | null; tag: string | null; untagged: boolean; missing: boolean }

export default function Sidebar({ dirs, tags, total, filter, open, onSelect }: {
  dirs: Dir[]; tags: TagList | null; total: number | null; filter: Filter; open: boolean;
  onSelect: (f: Partial<Filter>) => void;
}) {
  const none = { dir: null, tag: null, untagged: false, missing: false };
  const isAll = !filter.dir && !filter.tag && !filter.untagged && !filter.missing;
  const row = (active: boolean, label: string, count: number | null, f: Partial<Filter>, key: string) => (
    <button key={key} className={`side-row${active ? ' active' : ''}`} onClick={() => onSelect({ ...none, ...f })}
      aria-current={active ? 'true' : undefined} title={label}>
      <span className="side-label">{label}</span>
      {count !== null && <span className="side-count">{count}</span>}
    </button>
  );
  return (
    <nav className={`sidebar${open ? ' open' : ''}`} aria-label="フォルダとタグ">
      <div className="side-heading">フォルダ</div>
      {row(isAll, 'すべて', total, {}, 'all')}
      {dirs.map((d) => row(filter.dir === String(d.id), dirLabel(d), d.count, { dir: String(d.id) }, `d${d.id}`))}
      <div className="side-heading">タグ</div>
      {tags?.tags.map((t) => row(filter.tag === String(t.tagid), `# ${t.tag}`, t.count, { tag: String(t.tagid) }, `t${t.tagid}`))}
      {tags && row(filter.untagged, 'タグなし', tags.untagged, { untagged: true }, 'untagged')}
      <div className="side-spacer" />
      {row(filter.missing, '欠損ファイル', null, { missing: true }, 'missing')}
    </nav>
  );
}
