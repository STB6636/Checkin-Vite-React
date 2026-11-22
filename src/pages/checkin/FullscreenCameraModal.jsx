import React, { useState, useEffect, useRef } from 'react';
import { useCameraStream } from '../../hooks/useCameraStream.js';
import { SettingsModel } from '../../models/SettingsModel.js';

/**
 * FullscreenCameraModal (ADR-0019 + Full Visual Parity + Option 1 Enhancements)
 * - Mirror -scale-x-100 for front camera
 * - Dashed face guide frame + badge "จัดใบหน้าให้อยู่ในกรอบ"
 * - #cameraPermissionHintBanner
 * - Retains React enhancements: Preview/Retake + Flip Camera + Gallery Fallback
 */
export function FullscreenCameraModal({ open, onClose, onConfirmPhoto, allowGalleryFallback = true, title = 'ถ่ายภาพยืนยันการลงเวลา' }) {
  const { videoRef, canvasRef, facingMode, ready, starting, error, startCamera, stopCamera, flipCamera, capturePhoto } = useCameraStream();
  const [capturedDataUrl, setCapturedDataUrl] = useState('');
  const galleryRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCapturedDataUrl('');
      startCamera('user');
    } else {
      stopCamera();
      setCapturedDataUrl('');
    }
  }, [open, startCamera, stopCamera]);

  if (!open) return null;

  const handleCapture = () => {
    const dataUrl = capturePhoto();
    if (dataUrl) {
      setCapturedDataUrl(dataUrl);
      stopCamera();
    }
  };

  const handleRetake = () => {
    setCapturedDataUrl('');
    startCamera();
  };

  const handleGalleryFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await SettingsModel.fileToDataUrl(file);
      if (dataUrl) {
        setCapturedDataUrl(dataUrl);
        stopCamera();
      }
    } catch (_) {}
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9995] bg-slate-950/95 flex flex-col items-center justify-between p-3 sm:p-5" style={{ height: '100dvh' }}>
      <input ref={galleryRef} type="file" accept="image/*" capture="user" onChange={handleGalleryFile} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <div className="w-full max-w-md flex items-center justify-between text-white">
        <span className="font-bold text-sm truncate">
          <i className="fa-solid fa-camera text-emerald-400 mr-2" />{title}
        </span>
        <button type="button" onClick={handleClose} className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {/* Permission Hint Banner (#cameraPermissionHintBanner) */}
      {!capturedDataUrl && !error && (
        <div id="cameraPermissionHintBanner" className="w-full max-w-sm mt-1 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-200 text-center">
          <i className="fa-solid fa-shield-halved mr-1 text-emerald-400" />
          กรุณาอนุญาตสิทธิ์กล้องหากเบราว์เซอร์สอบถาม และถ่ายภาพหน้าตรงให้ชัดเจน
        </div>
      )}

      {/* 3:4 Portrait Stage */}
      <div className="relative w-full max-w-sm flex-1 my-2 flex items-center justify-center min-h-0">
        <div className="relative w-full max-h-full aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 border-2 border-emerald-500/60 shadow-2xl flex items-center justify-center">
          {capturedDataUrl ? (
            <img src={capturedDataUrl} alt="ภาพถ่ายยืนยัน" className="w-full h-full object-cover" />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
              {/* Dashed Face Guide Overlay */}
              {ready && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4">
                  <span className="px-3 py-1 rounded-full bg-slate-950/65 text-white text-[11px] font-bold backdrop-blur-xs border border-white/20">
                    จัดใบหน้าให้อยู่ในกรอบ
                  </span>
                  <div className="w-48 h-60 rounded-[50%] border-2 border-dashed border-emerald-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                  <span className="h-4" />
                </div>
              )}
              {starting && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                  <i className="fa-solid fa-circle-notch fa-spin text-2xl text-emerald-400" />
                  <span>กำลังเปิดกล้อง...</span>
                </div>
              )}
              {error && (
                <div className="absolute inset-0 bg-slate-900/90 p-5 flex flex-col items-center justify-center text-center text-white text-xs gap-3">
                  <i className="fa-solid fa-video-slash text-3xl text-amber-400" />
                  <p>{error}</p>
                  {allowGalleryFallback && (
                    <button type="button" onClick={() => galleryRef.current?.click()} className="px-4 py-2 rounded-xl bg-emerald-600 font-bold text-white">
                      <i className="fa-solid fa-images mr-1.5" />เลือกรูปจากคลังภาพ / กล้องเครื่อง
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="w-full max-w-md flex items-center justify-center gap-3 pb-1">
        {capturedDataUrl ? (
          <>
            <button type="button" onClick={handleRetake} className="px-5 py-3 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-bold text-sm">
              <i className="fa-solid fa-rotate-left mr-1.5" />ถ่ายใหม่
            </button>
            <button
              type="button"
              onClick={() => {
                const finalImg = capturedDataUrl;
                stopCamera();
                onConfirmPhoto(finalImg);
              }}
              className="flex-1 py-3 rounded-2xl bg-[#00744B] hover:bg-[#00A368] text-white font-extrabold text-sm shadow-lg"
            >
              <i className="fa-solid fa-check mr-1.5" />ใช้ภาพนี้และบันทึกเวลา
            </button>
          </>
        ) : (
          <>
            {allowGalleryFallback && (
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                title="เลือกรูปจากคลังภาพ"
              >
                <i className="fa-solid fa-images" />
              </button>
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={handleCapture}
              aria-label="กดถ่ายภาพ"
              className="w-16 h-16 rounded-full bg-white border-4 border-emerald-400 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition disabled:opacity-40"
            >
              <span className="w-11 h-11 rounded-full bg-[#00744B] block" />
            </button>
            <button
              type="button"
              onClick={flipCamera}
              className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
              title="สลับกล้องหน้า/หลัง"
            >
              <i className="fa-solid fa-camera-rotate" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
