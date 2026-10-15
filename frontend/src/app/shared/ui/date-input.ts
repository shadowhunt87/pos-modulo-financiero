import { ChangeDetectionStrategy, Component, ElementRef, effect, forwardRef, input, output, signal, untracked, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const pad = (n: number) => String(n).padStart(2, '0');

/** «2026-10-15» → «15/10/2026» (vacío si no es una fecha AAAA-MM-DD). */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** «15/10/2026», «15-10-2026», «15102026» o «2026-10-15» → «2026-10-15»; null si no es una fecha válida. */
export function parseDmy(text: string): string | null {
  const t = text.trim();
  let d: number, m: number, y: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = /^(\d{2})(\d{2})(\d{4})$/.exec(t))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2200 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Campo de fecha en formato dominicano (dd/mm/aaaa), igual en cualquier navegador (el nativo sale en el formato del
 * idioma del navegador: mm/dd/yyyy en inglés). El valor es siempre AAAA-MM-DD, como el que espera la API.
 * Sirve con formularios (formControlName, ngModel) o suelto con [value] y (dateChange).
 */
@Component({
  selector: 'app-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateInput), multi: true }],
  // El id lo lleva el campo de texto (para su <label for>), no el elemento anfitrión
  host: { '[attr.id]': 'null', '[attr.name]': 'null' },
  template: `
    <div class="wrap" [class.bad]="invalid()">
      <input #box class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10"
        [attr.id]="id() || null" [attr.name]="name() || null" [disabled]="disabled()" [value]="text()"
        [attr.aria-invalid]="invalid() || null" (input)="onType($any($event.target).value)" (blur)="commit()" (keydown.enter)="commit()" />
      <button type="button" class="cal" [disabled]="disabled()" (click)="openPicker()" aria-label="Elegir la fecha en el calendario" tabindex="-1">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
      </button>
      <input #native class="native" type="date" tabindex="-1" aria-hidden="true" [value]="iso()" (change)="fromPicker($any($event.target).value)" />
    </div>
    @if (invalid()) { <span class="error-text">Escribe la fecha como dd/mm/aaaa.</span> }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .wrap { position: relative; }
    .input { padding-right: 36px; font-variant-numeric: tabular-nums; }
    .bad .input { border-color: var(--neg); }
    .cal { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; border: 0; border-radius: 6px; background: none; color: var(--text-faint); cursor: pointer; display: grid; place-items: center; }
    .cal:hover:not(:disabled) { color: var(--primary); background: var(--surface-2); }
    .native { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; border: 0; padding: 0; }
  `,
})
export class DateInput implements ControlValueAccessor {
  readonly id = input('');
  readonly name = input('');
  /** Uso suelto (sin formulario): valor AAAA-MM-DD. */
  readonly value = input<string | null | undefined>(undefined);
  /** Uso suelto: emite AAAA-MM-DD, o '' si se borra. */
  readonly dateChange = output<string>();

  protected readonly text = signal('');
  protected readonly iso = signal('');
  protected readonly invalid = signal(false);
  protected readonly disabled = signal(false);
  private readonly native = viewChild.required<ElementRef<HTMLInputElement>>('native');
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // [value] de entrada (uso suelto): cuando cambia desde afuera, se muestra
    effect(() => {
      const v = this.value();
      if (v !== undefined) untracked(() => this.show(v ?? ''));
    });
  }

  private show(iso: string): void {
    this.iso.set(iso ?? '');
    this.text.set(isoToDmy(iso));
    this.invalid.set(false);
  }

  writeValue(v: string | null): void { this.show(v ? String(v).slice(0, 10) : ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  /** Pone las barras solas mientras se escribe: «151020» → «15/10/20». */
  protected onType(raw: string): void {
    let t = raw;
    if (/^\d+$/.test(raw.replace(/\//g, '')) && !/\/\//.test(raw)) {
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      t = digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
        : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    }
    this.text.set(t);
    this.invalid.set(false);
    // Completa y válida: se avisa enseguida (como el (input) del campo nativo)
    if (t.length === 10) { const iso = parseDmy(t); if (iso) this.emit(iso); }
  }

  protected commit(): void {
    this.onTouched();
    const t = this.text().trim();
    if (!t) { this.emit(''); return; }
    const iso = parseDmy(t);
    if (!iso) { this.invalid.set(true); return; }
    this.text.set(isoToDmy(iso));
    this.emit(iso);
  }

  protected openPicker(): void {
    const el = this.native().nativeElement;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  }

  protected fromPicker(iso: string): void {
    this.show(iso);
    this.emit(iso);
  }

  private emit(iso: string): void {
    if (iso === this.iso() && this.text() === isoToDmy(iso)) { if (iso) return; }
    this.iso.set(iso);
    this.onChange(iso);
    this.dateChange.emit(iso);
  }
}
