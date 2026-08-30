import './styles.css';
import App from './App.svelte';
import { mount } from 'svelte';

mount(App, { target: document.getElementById('app')! });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

const normalizedPath = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
const demoEntry = normalizedPath === '/demo' || new URLSearchParams(location.search).get('demo') === '1';
if (!demoEntry && !sessionStorage.getItem('page-counted')) {
  sessionStorage.setItem('page-counted', '1');
  fetch('/api/pageview', { method: 'POST', keepalive: true }).catch(() => undefined);
}
