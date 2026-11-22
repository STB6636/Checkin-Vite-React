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

  const stopCamera = useCallback(() => {
    seqRef.current += 1;
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => track.stop());
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

  const startCamera = useCallback(async (mode = facingMode) => {
    stopCamera();
    const mySeq = ++seqRef.current;
    setStarting(true);
    setError('');
    setReady(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้องสด กรุณาใช้ปุ่มเลือกรูปจากคลังภาพ');
      setStarting(false);
      return false;
    }

    const constraintsList = [
      { video: { facingMode: { ideal: mode }, width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: false },
      { video: { facingMode: mode }, audio: false },
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
      }
    }

    if (mySeq !== seqRef.current) {
      stream?.getTracks().forEach((t) => t.stop());
      return false;
    }

    if (!stream) {
      const msg = lastErr?.name === 'NotAllowedError'
        ? 'ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์กล้องหรือเลือกรูปจากคลังภาพ'
        : 'ไม่สามารถเปิดกล้องได้ในขณะนี้ กรุณาเลือกรูปจากคลังภาพแทน';
      setError(msg);
      setStarting(false);
      return false;
    }

    streamRef.current = stream;
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
  }, [facingMode, stopCamera]);

  const flipCamera = useCallback(async () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    await startCamera(next);
  }, [facingMode, startCamera]);

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
    startCamera,
    stopCamera,
    flipCamera,
    capturePhoto,
  };
}
