/* global SheetButton, document, sessionStorage, caches, URL, crypto, Response */
'use strict';

const picker = document.querySelector('#lecture-file');
const dropzone = document.querySelector('#lecture-dropzone');
const statusLine = document.querySelector('#upload-status');
const registration = document.querySelector('#registration');
const registerLink = registration.querySelector('.primary-link');
const loginLink = registration.querySelector('.login-link');
const cacheName = 'lecture-demo-drafts';
const prefix = '/lecture-demo/drafts/';
const intentKey = 'lecture-demo:continue';
const tabKey = 'lecture-demo:selection';
const lifetime = 24 * 60 * 60 * 1000;
let draft = null;

function present(id, filename) {
  draft = id;
  dropzone.classList.toggle('has-draft', Boolean(id));
  const fileAction = dropzone.querySelector('.pick-file');
  fileAction.dataset.sheet = id ? 'link' : 'blue';
  SheetButton.setText(fileAction, id ? 'Выбрать другой файл' : 'Выбрать файл');
  registration.hidden = !id;
  statusLine.textContent = id ? 'Вы выбрали «' + filename + '».' : '';
  if (id) {
    const destination = '/app/transcriptions/new?draft=' + id;
    loginLink.href = destination;
    sessionStorage.setItem(tabKey, id);
  } else {
    sessionStorage.removeItem(tabKey);
  }
}

async function restoreSelection() {
  picker.disabled = true;
  try {
    const cache = await caches.open(cacheName);
    const selected = sessionStorage.getItem(tabKey);
    for (const key of await cache.keys()) {
      const saved = await cache.match(key);
      if (!saved) continue;
      if (Number(saved.headers.get('x-expires')) <= Date.now()) await cache.delete(key);
      else if (selected && new URL(key.url).pathname === prefix + selected) {
        present(selected, decodeURIComponent(saved.headers.get('x-filename')));
      }
    }
  } catch {
    // Если хранилище недоступно, сообщим об этом при выборе файла.
  } finally {
    picker.disabled = false;
  }
}
void restoreSelection();

async function selectRecording(file) {
  if (!file || picker.disabled) return;
  const extension = '.' + file.name.split('.').pop().toLowerCase();
  if (
    !file.size ||
    file.size > 1024 ** 3 ||
    (!/^(audio|video)\//.test(file.type) && !picker.accept.split(',').includes(extension))
  ) {
    statusLine.textContent = 'Выберите непустой аудио- или видеофайл размером до 1 ГБ.';
    picker.value = '';
    return;
  }
  picker.disabled = true;
  registration.hidden = true;
  statusLine.textContent = 'Сохраняем запись в браузере…';
  try {
    const id = crypto.randomUUID();
    const cache = await caches.open(cacheName);
    await cache.put(
      prefix + id,
      new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': encodeURIComponent(file.name),
          'X-Expires': String(Date.now() + lifetime),
        },
      }),
    );
    const previous = draft;
    present(id, file.name);
    if (previous) await cache.delete(prefix + previous);
    registerLink.focus();
  } catch {
    statusLine.textContent =
      'Не удалось сохранить запись в браузере. Проверьте свободное место или выберите файл поменьше.';
    registration.hidden = !draft;
  } finally {
    picker.value = '';
    picker.disabled = false;
  }
}

picker.addEventListener('change', () => void selectRecording(picker.files[0]));
dropzone.addEventListener('dragover', (event) => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = picker.disabled ? 'none' : 'copy';
  dropzone.classList.toggle('is-dragging', !picker.disabled);
});
dropzone.addEventListener('dragleave', (event) => {
  if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging');
});
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-dragging');
  if (picker.disabled) return;
  const files = event.dataTransfer.files;
  if (files.length !== 1) {
    statusLine.textContent = 'Перетащите одну запись лекции.';
    return;
  }
  void selectRecording(files[0]);
});
registerLink.addEventListener('click', (event) => {
  try {
    // Передаём выбор только форме регистрации в этой вкладке.
    sessionStorage.setItem(
      intentKey,
      JSON.stringify({ id: draft, expires: Date.now() + lifetime }),
    );
  } catch {
    event.preventDefault();
    statusLine.textContent =
      'Разрешите хранение данных сайта в браузере, чтобы продолжить после регистрации.';
  }
});
document.querySelector('#discard').addEventListener('click', async () => {
  try {
    const cache = await caches.open(cacheName);
    await cache.delete(prefix + draft);
    if (JSON.parse(sessionStorage.getItem(intentKey) || 'null')?.id === draft)
      sessionStorage.removeItem(intentKey);
    present(null);
    picker.focus();
  } catch {
    statusLine.textContent = 'Не удалось убрать файл. Попробуйте ещё раз.';
  }
});
