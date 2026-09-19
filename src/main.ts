// ============================================================
// Entry point
// ============================================================
import './styles/main.scss';
import { App } from './app';

document.addEventListener('DOMContentLoaded', () => {
  new App();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('ServiceWorker registration failed:', err);
    });
  });
}

