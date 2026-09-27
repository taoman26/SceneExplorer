export interface User { id: number; username: string; role: 'admin' | 'user' | 'viewer' }
export interface AuthStatus { needsSetup: boolean; user: User | null }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public retryAfter?: number, public tagid?: number) {
    super(message ?? code);
  }
}

// All requests carry the CSRF header the server requires on state-changing calls.
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: { 'X-Requested-With': 'SceneExplorer', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message, data.retryAfter, data.tagid);
  return data as T;
}

export const authStatus = () => api<AuthStatus>('/auth/status');
export const login = (username: string, password: string) =>
  api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
export const setup = (username: string, password: string) =>
  api<{ user: User }>('/auth/setup', { method: 'POST', body: { username, password } });
export const logout = () => api<{ ok: true }>('/auth/logout', { method: 'POST', body: {} });

export interface Video {
  id: number; directory: string; name: string; path: string; size: number; wtime: number; duration: number;
  format: string; bitrate: number; vcodec: string; acodec: string; width: number; height: number; fps: number;
  opencount: number; lastaccess: number | null; tagids: number[];
}
export interface VideoList { total: number; page: number; size: number; items: Video[] }
export interface Dir { id: number; directory: string; displaytext: string; count: number }
export interface TagInfo { tagid: number; tag: string; count: number }
export interface TagList { tags: TagInfo[]; untagged: number }

export const listVideos = (params: URLSearchParams) => api<VideoList>(`/videos?${params}`);
export const listDirs = () => api<Dir[]>('/dirs');
export const listTags = () => api<TagList>('/tags');
export const thumbUrl = (id: number, n = 1) => `/api/videos/${id}/thumb/${n}`;

export interface VideoDetailData extends Video { thumbCount: number; available: boolean }
export const getVideo = (id: number) => api<VideoDetailData>(`/videos/${id}`);
export const streamUrl = (id: number, download = false) => `/api/videos/${id}/stream${download ? '?download=1' : ''}`;

export const createPlayToken = (id: number) =>
  api<{ token: string; url: string; expiresAt: number }>(`/videos/${id}/play-token`, { method: 'POST' });

export const setVideoTags = (id: number, tagids: number[]) =>
  api<{ tagids: number[] }>(`/videos/${id}/tags`, { method: 'PUT', body: { tagids } });
export const createTag = (tag: string) => api<{ tagid: number; tag: string; count: number }>('/tags', { method: 'POST', body: { tag } });
export const deleteTag = (tagid: number) => api<{ ok: true }>(`/tags/${tagid}`, { method: 'DELETE' });

export interface AdminUser extends User { created_at: number; last_login: number | null }
export const listUsers = () => api<AdminUser[]>('/users');
export const createUser = (username: string, password: string, role: User['role']) =>
  api<AdminUser>('/users', { method: 'POST', body: { username, password, role } });
export const updateUser = (id: number, patch: { role?: User['role']; password?: string }) =>
  api<AdminUser>(`/users/${id}`, { method: 'PATCH', body: patch });
export const removeUser = (id: number) => api<{ ok: true }>(`/users/${id}`, { method: 'DELETE' });
