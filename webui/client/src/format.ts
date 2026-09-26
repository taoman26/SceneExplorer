export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(r)}`;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i < 2 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function dirLabel(d: { directory: string; displaytext: string }): string {
  return d.displaytext || d.directory.replace(/\/$/, '');
}

// m:ss under an hour, h:mm:ss otherwise (thumbnail time labels)
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

// Qt cuts thumbnail i of N at (i - 0.5) * duration / N.
export const thumbTime = (i: number, count: number, duration: number) => ((i - 0.5) * duration) / count;

export const fmtBitrate = (bps: number) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1)} Mbps` : `${Math.round(bps / 1e3)} kbps`);
export const fmtDate = (epochSec: number) => new Date(epochSec * 1000).toLocaleString('ja-JP');
