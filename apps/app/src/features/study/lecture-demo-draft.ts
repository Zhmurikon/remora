const intentKey = 'lecture-demo:continue';
const cacheName = 'lecture-demo-drafts';
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;

export function pendingLectureId(email: string): string | null {
  try {
    const pending = JSON.parse(
      localStorage.getItem(intentKey + ':' + email.trim().toLowerCase()) ??
        sessionStorage.getItem(intentKey) ??
        'null',
    );
    return pending && pending.expires > Date.now() && uuid.test(pending.id) ? pending.id : null;
  } catch {
    return null;
  }
}

export function clearLectureIntent(id: string, email: string) {
  if (pendingLectureId(email) === id) {
    localStorage.removeItem(intentKey + ':' + email.trim().toLowerCase());
    sessionStorage.removeItem(intentKey);
  }
}

export async function loadLectureDraft(id: string): Promise<File | null> {
  if (!uuid.test(id)) return null;
  const cache = await caches.open(cacheName);
  const path = '/lecture-demo/drafts/' + id;
  const saved = await cache.match(path);
  if (!saved) return null;
  if (Number(saved.headers.get('x-expires')) <= Date.now()) {
    await cache.delete(path);
    return null;
  }
  const blob = await saved.blob();
  return new File([blob], decodeURIComponent(saved.headers.get('x-filename') ?? 'Лекция'), {
    type: blob.type,
  });
}

export async function removeLectureDraft(id: string) {
  if (!uuid.test(id)) return;
  const cache = await caches.open(cacheName);
  await cache.delete('/lecture-demo/drafts/' + id);
}
