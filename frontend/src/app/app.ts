import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHost } from './shared/ui/confirm-host';
import { Toasts } from './shared/ui/toasts';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Toasts, ConfirmHost],
  template: `<router-outlet /><app-toasts /><app-confirm-host />`,
})
export class App {}
