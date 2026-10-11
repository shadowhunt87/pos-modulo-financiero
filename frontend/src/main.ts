import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Tema guardado, o el del sistema.
try {
  const saved = localStorage.getItem('fm.theme');
  const theme = saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset['theme'] = theme;
} catch { /* sin almacenamiento */ }

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
