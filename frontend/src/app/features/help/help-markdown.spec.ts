import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HelpContent } from './help-content';
import { HelpMarkdown } from './help-markdown';

async function render(md: string): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HelpContent, useValue: { sectionByFile: (f: string) => (f === '03-clientes.md' ? { slug: 'clientes', archivo: f, titulo: 'Clientes' } : null) } },
    ],
  });
  const fixture = TestBed.createComponent(HelpMarkdown);
  fixture.componentRef.setInput('source', md);
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r, 50));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('HelpMarkdown (saneado)', () => {
  it('muestra el HTML crudo como texto, sin crear etiquetas', async () => {
    const el = await render('Hola <script>alert(1)</script> <img src=x onerror=alert(1)> <iframe src="https://x.com"></iframe>');
    expect(el.querySelector('script, iframe, img')).toBeNull();
    expect(el.textContent).toContain('<script>');
  });

  it('quita enlaces peligrosos pero deja el texto', async () => {
    const el = await render('[clic](javascript:alert(1)) y [otro](data:text/html,x) y [web](https://www.dgii.gov.do)');
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://www.dgii.gov.do']);
    expect(el.textContent).toContain('clic');
  });

  it('solo permite imágenes locales de manual/img', async () => {
    const el = await render('![a](https://malo.com/x.png) ![b](data:image/png;base64,AAAA) ![c](img/factura-2026-10.png) ![d](img/../../secreto.png)');
    const srcs = Array.from(el.querySelectorAll('img')).map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['manual/img/factura-2026-10.png']);
  });

  it('convierte enlaces a otro .md en rutas /help y respeta las rutas de la app', async () => {
    const el = await render('[c](03-clientes.md#crear-un-cliente) [f](/invoices/new) [x](99-no-existe.md)');
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/help/clientes#crear-un-cliente', '/invoices/new']);
  });

  it('pone id a los títulos para poder saltar a ellos', async () => {
    const el = await render('# Título\n\n## En pocas palabras\n\ntexto\n\n## En pocas palabras\n');
    expect(Array.from(el.querySelectorAll('h2')).map((h) => h.id)).toEqual(['en-pocas-palabras', 'en-pocas-palabras-2']);
  });
});
