import { AttemptLimiter, ipKey } from './attempt-limiter.js';

describe('AttemptLimiter.consume / refund', () => {
  it('es síncrono, no suma si está en el límite y refund resta', () => {
    const l = new AttemptLimiter();
    const rules = [{ key: 'k', limit: 2 }];
    expect([l.consume(rules), l.consume(rules)]).toEqual([0, 0]);
    expect(l.consume(rules)).toBeGreaterThan(0);
    l.refund(['k']);
    expect(l.consume(rules)).toBe(0);
    expect(l.consume(rules)).toBeGreaterThan(0);
  });

  it('IPv6 en la misma /64 comparte clave; en otra /64 no; IPv4 igual', () => {
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe(ipKey('2001:db8:1:2:bbbb:cccc:dddd:eeee'));
    expect(ipKey('2001:db8:1:2::1')).not.toBe(ipKey('2001:db8:1:3::1'));
    expect(ipKey('198.51.100.7')).toBe('198.51.100.7');
    expect(ipKey('::ffff:198.51.100.7')).toBe('198.51.100.7');
  });
});
