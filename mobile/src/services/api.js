import { API_URL } from '../config';
import { auth } from './firebase';

export class ApiError extends Error {
  constructor({ code, message, retryAfterSec, fallback }, status) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
    this.fallback = fallback;
  }
}

async function call(path, body, method = 'POST') {
  const token = await auth?.currentUser?.getIdToken();
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError({ code: 'OFFLINE', message: "Can't reach Pluck. Check your connection." }, 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? { code: 'INTERNAL', message: `Server error ${res.status}` }, res.status);
  return json;
}

/** -> { platform, candidates: [{ url, kind, score }], warnings, fallback } */
export const extractFromLink = (url) => call('/v1/extract', { url });

/** Save one candidate (imageUrl) or a manual capture (imageBase64). -> { sticker, duplicate? } */
export const importSticker = (payload) => call('/v1/stickers/import', payload);

export const deleteSticker = (id) => call(`/v1/stickers/${encodeURIComponent(id)}`, undefined, 'DELETE');
