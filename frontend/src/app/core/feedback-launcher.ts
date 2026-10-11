import { Injectable, signal } from '@angular/core';

/**
 * Abre el diálogo "Enviar comentario" desde cualquier pantalla (barra superior, pantalla "Mis comentarios" vacía…).
 * El diálogo vive una sola vez en el shell. `sent` sube cada vez que se envía uno, para que "Mis comentarios" se refresque.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackLauncher {
  readonly isOpen = signal(false);
  readonly sent = signal(0);
  open(): void { this.isOpen.set(true); }
  close(): void { this.isOpen.set(false); }
}
