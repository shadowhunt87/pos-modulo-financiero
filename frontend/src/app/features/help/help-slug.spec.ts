import { slugify } from './help-slug';

describe('slugify', () => {
  it('quita tildes, símbolos y mayúsculas', () => {
    expect(slugify('En pocas palabras')).toBe('en-pocas-palabras');
    expect(slugify('¿Cómo anulo una factura?')).toBe('como-anulo-una-factura');
    expect(slugify('  Detalle contable (606/607) ')).toBe('detalle-contable-606-607');
  });
});
