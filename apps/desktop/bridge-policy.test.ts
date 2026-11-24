import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const { trustedSender } = createRequire(import.meta.url)('./bridge-policy.cjs');
describe('Electron IPC origin boundary', () => {
 const frame = { url: 'file:///app/web/index.html' };
 const window = { webContents: { mainFrame: frame } };
 const event = { sender: window.webContents, senderFrame: frame };
 it('accepts bundled main frame', () => expect(trustedSender(event, window, frame.url)).toBe(true));
 it('rejects iframe even on same URL', () => expect(trustedSender({ ...event, senderFrame: { ...frame } }, window, frame.url)).toBe(false));
 it('rejects different window', () => expect(trustedSender({ ...event, sender: {} }, window, frame.url)).toBe(false));
 it('rejects navigated remote content', () => expect(trustedSender(event, window, 'https://evil.example')).toBe(false));
 it('rejects a closed window', () => expect(trustedSender(event, null, frame.url)).toBe(false));
});
