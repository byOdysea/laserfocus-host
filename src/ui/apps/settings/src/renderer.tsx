import { createRoot } from 'react-dom/client';
import { SettingsApp } from './components/SettingsApp';

console.log('[Settings Renderer] Starting settings app initialization...');

const container = document.getElementById('settings-root');
if (!container) {
    console.error('[Settings Renderer] Failed to find the root element');
    throw new Error('Failed to find the root element');
}

console.log('[Settings Renderer] Root element found, creating React root...');
const root = createRoot(container);

console.log('[Settings Renderer] Rendering SettingsApp...');
root.render(<SettingsApp />);

console.log('[Settings Renderer] Settings app render call completed');