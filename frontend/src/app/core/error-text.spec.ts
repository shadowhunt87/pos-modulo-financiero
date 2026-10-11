import { fieldLabel, translateValidation } from './error-text';

describe('translateValidation', () => {
  it('traduce los mensajes comunes', () => {
    expect(translateValidation('partnerId must be a UUID')).toBe('Elige una opción de la lista en «Cliente o proveedor».');
    expect(translateValidation('description should not be empty')).toBe('«Descripción» es obligatorio.');
    expect(translateValidation('items.0.quantity must not be less than 0.0001')).toBe('«Cantidad (línea 1)» no puede ser menor que 0.0001.');
    expect(translateValidation('property role should not exist')).toContain('«Rol»');
    expect(translateValidation('items must contain at least 1 elements')).toBe('Agrega al menos 1 en «Líneas».');
  });
  it('deja igual lo que no reconoce', () => {
    expect(translateValidation('Indica exactamente uno: invoiceId, paymentId')).toBe('Indica exactamente uno: invoiceId, paymentId');
  });
  it('nombra campos anidados', () => {
    expect(fieldLabel('lines.2.accountId')).toBe('Cuenta (línea 3)');
    expect(fieldLabel('campoDesconocido')).toBe('campoDesconocido');
  });
});
