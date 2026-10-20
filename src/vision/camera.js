// Camera access. Errors are turned into plain codes for friendly messages.
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-api'), { code: 'insecure' });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
  } catch (err) {
    const name = err?.name || '';
    const code =
      name === 'NotAllowedError' || name === 'SecurityError'
        ? 'permission'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'no-camera'
          : name === 'NotReadableError'
            ? 'busy'
            : 'camera';
    throw Object.assign(new Error(name || 'camera'), { code });
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
  }
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}
