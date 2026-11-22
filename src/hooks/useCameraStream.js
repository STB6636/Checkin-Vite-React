import { useState, useRef, useCallback, useEffect } from 'react';
import { UIHelpers } from '../core/UIHelpers.js';

/**
 * Camera Lifecycle MediaStream Guard & Hardware Teardown Hook (ADR-0019)
 * Guarantees all hardware MediaStreamTracks are stopped on close/unmount across iOS/Android/LINE/Desktop.
 */
export function useCameraStream() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const seqRef = useRef(0);

  const [facingMode, setFacingMode] = useState('user');
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const activeModeRef = useRef('user');

  const stopCamera = useCallback(() => {
    seqRef.current += 1;
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch (_) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch (_) {}
    }
    setReady(false);
    setStarting(false);
  }, []);

  const startCamera = useCallback(async (mode, retryAttempt = 0) => {
    stopCamera();
    const targetMode = mode || activeModeRef.current || 'user';
    activeModeRef.current = targetMode;
    setFacingMode(targetMode);
    const mySeq = ++seqRef.current;
    setStarting(true);
    setError('');
    setErrorCode('');
    setReady(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้องสด กรุณาใช้ปุ่มเลือกรูปจากคลังภาพ');
      setErrorCode('unsupported');
      setStarting(false);
      return false;
    }

    const constraintsList = [
      { video: { facingMode: { ideal: targetMode }, width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false },
      { video: { facingMode: targetMode }, audio: false },
      { video: true, audio: false },
    ];

    let stream = null;
    let lastErr = null;
    for (const c of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (err) {
        lastErr = err;
        // Stop immediately on NotAllowedError / PermissionDeniedError (never prompt 3x!)
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.name === 'SecurityError') {
          break;
        }
      }
    }

    if (mySeq !== seqRef.current) {
      stream?.getTracks().forEach((t) => t.stop());
      return false;
    }

    if (!stream) {
      // Transient hardware lock retry once after 300ms
      if (retryAttempt === 0 && (lastErr?.name === 'NotReadableError' || lastErr?.name === 'AbortError')) {
        await new Promise((r) => window.setTimeout(r, 300));
        if (mySeq === seqRef.current) {
          return startCamera(targetMode, 1);
        }
        return false;
      }

      if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError' || lastErr?.name === 'SecurityError') {
        setError('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์กล้องในเบราว์เซอร์หรือเลือกรูปจากคลังภาพ');
        setErrorCode('permission_denied');
      } else if (lastErr?.name === 'NotFoundError' || lastErr?.name === 'DevicesNotFoundError') {
        setError('ไม่พบอุปกรณ์กล้องบนเครื่องนี้ กรุณาเลือกรูปจากคลังภาพแทน');
        setErrorCode('not_found');
      } else {
        setError('ไม่สามารถเปิดกล้องได้ในขณะนี้ กรุณากดลองเปิดกล้องใหม่หรือเลือกรูปจากคลังภาพ');
        setErrorCode('in_use');
      }
      setStarting(false);
      return false;
    }

    streamRef.current = stream;
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (mySeq !== seqRef.current) return;
        setReady(false);
        setError('สัญญาณกล้องถูกตัดการทำงานโดยระบบปฏิบัติการ กรุณากดเปิดกล้องอีกครั้ง');
        setErrorCode('ended');
      };
    });

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.muted = true;
      try {
        await videoEl.play();
      } catch (_) {}
    }
    setReady(true);
    setStarting(false);
    return true;
  }, [stopCamera]);

  // Recover camera cleanly if mobile browser suspends the stream when switching apps
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && streamRef.current) {
        const tracks = streamRef.current.getVideoTracks();
        const isDead = tracks.length === 0 || tracks.every((t) => t.readyState === 'ended');
        if (isDead) {
          startCamera(activeModeRef.current, 0);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [startCamera]);

  const flipCamera = useCallback(async () => {
    const next = activeModeRef.current === 'user' ? 'environment' : 'user';
    await startCamera(next, 0);
  }, [startCamera]);

  const capturePhoto = useCallback(() => {
    const videoEl = videoRef.current;
    const canvasEl = canvasRef.current;
    if (!videoEl || !canvasEl || !videoEl.videoWidth) return null;
    return UIHelpers.capturePortrait3x4FromVideo(videoEl, canvasEl);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    facingMode,
    ready,
    starting,
    error,
    errorCode,
    startCamera,
    stopCamera,
    flipCamera,
    capturePhoto,
  };
}
