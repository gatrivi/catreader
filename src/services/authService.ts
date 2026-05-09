/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const authService = {
  getPortableId(): string | null {
    return localStorage.getItem('catreader_portable_id');
  },

  getUsername(): string | null {
    return localStorage.getItem('catreader_username');
  },

  async login(username: string, pin: string): Promise<string> {
    // Simple hash to create a portable ID
    const msgBuffer = new TextEncoder().encode(`${username}:${pin}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    localStorage.setItem('catreader_portable_id', hashHex);
    localStorage.setItem('catreader_username', username);
    return hashHex;
  },

  logout() {
    localStorage.removeItem('catreader_portable_id');
    localStorage.removeItem('catreader_username');
    localStorage.removeItem('catreader_pfp');
  },

  setPFP(svg: string) {
    localStorage.setItem('catreader_pfp', svg);
  },

  getPFP(): string | null {
    return localStorage.getItem('catreader_pfp');
  }
};
