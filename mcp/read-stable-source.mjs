// OneDrive may update metadata on the first local read. Retry the whole guarded
// read once; every attempt retains path, identity, size and timestamp checks.
// Fingerprint validation remains with the caller after a stable read succeeds.
export async function readStableSource(read) {
  try { return await read(); }
  catch (error) {
    if (error?.code !== 'MEDIA_CHANGED') throw error;
    return await read();
  }
}