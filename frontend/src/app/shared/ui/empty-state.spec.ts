import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EmptyState } from './empty-state';

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [EmptyState], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(EmptyState);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EmptyState', () => {
  it('muestra explicación y botón para crear el primero', () => {
    const el = render({ title: 'Todavía no hay facturas', text: 'Crea la primera.', actionLabel: 'Nueva factura', actionLink: '/invoices/new' });
    expect(el.querySelector('h3')?.textContent).toContain('Todavía no hay facturas');
    expect(el.querySelector('a.btn-primary')?.textContent).toContain('Nueva factura');
  });
  it('oculta el botón si no hay permiso', () => {
    const el = render({ title: 'Vacío', actionLabel: 'Crear', actionLink: '/x', canAct: false });
    expect(el.querySelector('a')).toBeNull();
  });
  it('con filtros ofrece «Quitar filtros»', () => {
    const el = render({ title: 'No hay con esos filtros', actionLabel: 'Crear', actionLink: '/x', filtered: true });
    expect(el.querySelector('button')?.textContent).toContain('Quitar filtros');
    expect(el.querySelector('a')).toBeNull();
  });
  it('sin enlace, el botón emite «action» (abre una ventana)', () => {
    TestBed.configureTestingModule({ imports: [EmptyState], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(EmptyState);
    fixture.componentRef.setInput('title', 'Vacío');
    fixture.componentRef.setInput('actionLabel', 'Nuevo');
    let n = 0;
    fixture.componentInstance.action.subscribe(() => n++);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(n).toBe(1);
  });
});
