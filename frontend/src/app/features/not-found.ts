import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `<div class="page"><div class="empty"><h3>Esta página no existe</h3><p>La dirección no coincide con ninguna sección.</p><p style="margin-top:12px"><a class="btn" routerLink="/">Ir al panel</a></p></div></div>`,
})
export class NotFound {}
