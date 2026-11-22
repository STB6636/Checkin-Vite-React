/**
 * @file src/utils/vendorBridge.js
 * @description Lean vendor loader: loads SweetAlert2 eagerly and code-splits heavy
 * libraries (Leaflet, XLSX, ExcelJS) dynamically on demand so initial load stays fast.
 */
import Swal from 'sweetalert2';

if (typeof window !== 'undefined') {
  window.Swal = Swal;
}

let leafletPromise = null;
export async function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = (async () => {
      const [{ default: L }, markerIcon2x, markerIcon, markerShadow] = await Promise.all([
        import('leaflet'),
        import('leaflet/dist/images/marker-icon-2x.png'),
        import('leaflet/dist/images/marker-icon.png'),
        import('leaflet/dist/images/marker-shadow.png'),
      ]);
      if (L?.Icon?.Default) {
        delete L.Icon.Default.prototype._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: markerIcon2x.default || markerIcon2x,
          iconUrl: markerIcon.default || markerIcon,
          shadowUrl: markerShadow.default || markerShadow,
        });
      }
      if (typeof window !== 'undefined') window.L = L;
      return L;
    })();
  }
  return leafletPromise;
}

let xlsxPromise = null;
export async function loadXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import('xlsx').then((mod) => {
      const lib = mod.default || mod;
      if (typeof window !== 'undefined') window.XLSX = lib;
      return lib;
    });
  }
  return xlsxPromise;
}

let excelJsPromise = null;
export async function loadExcelJs() {
  if (!excelJsPromise) {
    excelJsPromise = import('exceljs').then((mod) => {
      const lib = mod.default || mod;
      if (typeof window !== 'undefined') window.ExcelJS = lib;
      return lib;
    });
  }
  return excelJsPromise;
}

export { Swal };
