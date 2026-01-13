/**
 * QR Code display module for terminal
 * Displays nostrconnect:// URIs as scannable QR codes
 */

import qrcode from 'qrcode-terminal';

export interface QRDisplayOptions {
  /** Whether to use small QR code (default: false for better scanning) */
  small?: boolean;
}

/**
 * Generate and display a QR code in the terminal
 * @param data - The data to encode (typically a nostrconnect:// URI)
 * @param options - Display options
 * @returns A promise that resolves to the QR code string output
 */
export function displayQRCode(data: string, options: QRDisplayOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    qrcode.generate(data, { small: options.small ?? false }, (qrString) => {
      if (qrString) {
        resolve(qrString);
      } else {
        reject(new Error('Failed to generate QR code'));
      }
    });
  });
}

/**
 * Format the connection instructions with QR code
 * @param nostrconnectUri - The nostrconnect:// URI
 * @param qrString - The generated QR code string
 * @returns Formatted output string
 */
export function formatConnectionInstructions(nostrconnectUri: string, qrString: string): string {
  // Strip ANSI codes from QR and use unicode blocks instead
  const cleanQR = qrString
    .replace(/\x1b\[47m  \x1b\[0m/g, '██')  // white -> filled block
    .replace(/\x1b\[40m  \x1b\[0m/g, '  ')  // black -> space
    .replace(/\x1b\[[0-9;]*m/g, '');         // strip any remaining ANSI
  
  // Return as JSON so it's treated as data, not prose
  return JSON.stringify({
    qr_code: cleanQR,
    uri: nostrconnectUri,
    instructions: "Scan QR or paste URI into signer (Amber/nsec.app/Primal), then run: shakespeare_complete"
  }, null, 2);
}

/**
 * Format a simple status message
 */
export function formatStatusMessage(connected: boolean, pubkey?: string): string {
  if (connected && pubkey) {
    const npubShort = pubkey.length > 16 ? `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 8)}` : pubkey;
    return `Connected as ${npubShort}`;
  }
  return 'Not connected. Use shakespeare_connect to authenticate.';
}
