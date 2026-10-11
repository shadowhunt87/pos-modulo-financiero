import { ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface ComboOption { value: string; label: string; hint?: string }

/**
 * Selector con búsqueda para listas largas (cuentas, terceros).
 * Se usa con formControlName / [formControl]; el valor es el `value` de la opción.
 */
@Component({
  selector: 'app-combobox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Combobox), multi: true }],
  template: `
    <div class="cb" (focusout)="onFocusOut($event)">
      <input #box class="input" type="text" role="combobox" autocomplete="off" [attr.aria-expanded]="open()"
        [placeholder]="placeholder()" [disabled]="disabled()" [value]="open() ? query() : selectedLabel()"
        (focus)="openList()" (input)="onInput($any($event.target).value)" (keydown)="onKey($event)" />
      @if (clearable() && value() && !disabled()) {
        <button type="button" class="clear" aria-label="Quitar selección" (mousedown)="$event.preventDefault()" (click)="pick(null)">✕</button>
      }
      @if (open()) {
        <ul class="list" role="listbox">
          @for (o of filtered(); track o.value; let i = $index) {
            <li role="option" [class.active]="i === cursor()" [attr.aria-selected]="o.value === value()"
              (mousedown)="$event.preventDefault()" (click)="pick(o)">
              <span>{{ o.label }}</span>@if (o.hint) { <span class="faint hint-r">{{ o.hint }}</span> }
            </li>
          } @empty { <li class="none">Sin resultados</li> }
        </ul>
      }
    </div>
  `,
  styles: `
    .cb { position: relative; }
    .clear { position: absolute; right: 6px; top: 5px; border: 0; background: none; color: var(--text-faint); cursor: pointer; height: 24px; width: 24px; }
    .list { position: absolute; z-index: 60; left: 0; right: 0; top: 38px; margin: 0; padding: 4px; list-style: none; max-height: 260px; overflow: auto; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius); box-shadow: var(--shadow-pop); min-width: 220px; }
    li { padding: 7px 10px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; gap: 12px; }
    li.active, li:hover { background: var(--primary-soft); }
    li[aria-selected="true"] { font-weight: 600; }
    li.none { color: var(--text-dim); cursor: default; } li.none:hover { background: none; }
    .hint-r { font-size: 12px; white-space: nowrap; }
  `,
})
export class Combobox implements ControlValueAccessor {
  readonly options = input<ComboOption[]>([]);
  readonly placeholder = input('Buscar…');
  readonly clearable = input(true);

  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly cursor = signal(0);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  protected readonly selectedLabel = computed(() => this.options().find((o) => o.value === this.value())?.label ?? '');
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = q ? this.options().filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q)) : this.options();
    return list.slice(0, 80);
  });

  private onChange: (v: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(v: string | null): void { this.value.set(v ?? null); }
  registerOnChange(fn: (v: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }

  protected openList(): void { this.query.set(''); this.cursor.set(0); this.open.set(true); queueMicrotask(() => this.box().nativeElement.select()); }
  protected onInput(v: string): void { this.query.set(v); this.cursor.set(0); this.open.set(true); }
  protected pick(o: ComboOption | null): void {
    this.value.set(o?.value ?? null);
    this.onChange(o?.value ?? null);
    this.open.set(false);
  }
  protected onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
    this.open.set(false); this.onTouched();
  }
  protected onKey(e: KeyboardEvent): void {
    const n = this.filtered().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.open.set(true); this.cursor.update((c) => Math.min(n - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.cursor.update((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && this.open()) { e.preventDefault(); const o = this.filtered()[this.cursor()]; if (o) this.pick(o); }
    else if (e.key === 'Escape') { this.open.set(false); }
  }
}
