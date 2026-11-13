import type { UploadedTrack } from './state';

const DB_NAME = 'dueboard-music';
const STORE_NAME = 'tracks';
const DB_VERSION = 1;

interface StoredTrack extends UploadedTrack {
  blob: Blob;
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the music library'));
  });
}

export async function addMusicFiles(files: File[]): Promise<UploadedTrack[]> {
  const accepted = files.filter((file) => file.type.startsWith('audio/')).slice(0, 50);
  if (accepted.length === 0) return [];
  const db = await openLibrary();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const added = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '') || file.name,
      size: file.size,
      type: file.type,
      blob: file as Blob,
    }));
    for (const track of added) store.put(track satisfies StoredTrack);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the music files'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not save the music files'));
    });
    return added.map(({ blob: _blob, ...track }) => track);
  } finally {
    db.close();
  }
}

export async function getMusicBlob(id: string): Promise<Blob | null> {
  const db = await openLibrary();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as StoredTrack | undefined)?.blob ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the music file'));
    });
  } finally {
    db.close();
  }
}

export async function deleteMusicFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openLibrary();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const id of ids) store.delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove the music files'));
    });
  } finally {
    db.close();
  }
}
