import { api } from '../../lib/api';
export async function uploadImage(file: File) {
  const ticket = await api.POST('/api/v1/media/upload-url', {
    body: { filename: file.name, mime: file.type, size_bytes: file.size },
  });
  if (ticket.error || !ticket.data) throw new Error();
  const put = await fetch(ticket.data.upload_url, {
    method: ticket.data.method,
    headers: ticket.data.headers,
    body: file,
  });
  if (!put.ok) throw new Error();
  const done = await api.POST('/api/v1/media/{asset_id}/complete', {
    params: { path: { asset_id: ticket.data.id } },
  });
  if (done.error || !done.data?.download_url) throw new Error();
  return {
    id: done.data.id,
    media: { url: done.data.download_url, width: done.data.width, height: done.data.height },
  };
}
