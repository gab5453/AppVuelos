import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Genera el código QR del pase de abordar en el navegador (el contrato entrega el contenido en `barcode`). */
export function QrImage({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: 168, errorCorrectionLevel: 'M', color: { dark: '#1B5E20', light: '#FFFFFF' } })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(undefined));
    return () => {
      active = false;
    };
  }, [value]);

  return src ? <img className="qr" src={src} width={168} height={168} alt={label} /> : <div className="qr qr-placeholder" aria-hidden="true" />;
}
