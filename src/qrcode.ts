/**
 * QR Code display module for terminal
 * Displays nostrconnect:// URIs as scannable QR codes
 */

import * as qrcode from 'qrcode-terminal';

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
  const border = '─'.repeat(60);
  
  return `
┌${border}┐
│  Shakespeare - Nostr Remote Signing                              
├${border}┤
│                                                                   
│  Scan this QR code with your Nostr signer app:                   
│  Amber (Android) or Primal (Android/iOS)                      
│                                                                   
${qrString.split('\n').map(line => `│  ${line}`).join('\n')}
│                                                                   
│  Or paste this URI into your bunker:                             
│  ${nostrconnectUri.length > 55 ? nostrconnectUri.substring(0, 55) + '...' : nostrconnectUri}
│                                                                   
│  Waiting for connection... (timeout in 5 minutes)                
└${border}┘
`.trim();
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
