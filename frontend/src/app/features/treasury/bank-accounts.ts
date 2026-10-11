import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { BankAccountsTab } from './bank-accounts-tab';
import { BankRulesTab } from './bank-rules-tab';
import { CashRegistersTab } from './cash-registers-tab';
import { TransfersTab } from './transfers-tab';

type Tab = 'banks' | 'cash' | 'rules' | 'transfers';

/** Bancos y cajas: cuentas bancarias, cajas, reglas de categorización y transferencias. */
@Component({
  selector: 'app-bank-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BankAccountsTab, CashRegistersTab, BankRulesTab, TransfersTab],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Bancos y cajas</h1><p class="sub">Cuentas bancarias, cajas, reglas para categorizar movimientos y transferencias entre ellas.</p></div>
      </div>
      <div class="tabs" role="tablist" aria-label="Secciones de tesorería">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" class="tab" id="tab-{{ t.id }}" [class.active]="tab() === t.id" [attr.aria-selected]="tab() === t.id"
            [attr.aria-controls]="'panel-' + t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
        }
      </div>
      <div role="tabpanel" [attr.id]="'panel-' + tab()" [attr.aria-labelledby]="'tab-' + tab()">
        @switch (tab()) {
          @case ('banks') { <app-bank-accounts-tab /> }
          @case ('cash') { <app-cash-registers-tab /> }
          @case ('rules') { <app-bank-rules-tab /> }
          @case ('transfers') { <app-transfers-tab /> }
        }
      </div>
    </div>
  `,
})
export class BankAccounts {
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'banks', label: 'Cuentas bancarias' }, { id: 'cash', label: 'Cajas' },
    { id: 'rules', label: 'Reglas bancarias' }, { id: 'transfers', label: 'Transferencias' },
  ];
  protected readonly tab = signal<Tab>('banks');
}
