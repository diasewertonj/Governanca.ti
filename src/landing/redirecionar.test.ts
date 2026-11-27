import { describe, expect, it } from 'vitest';
import { destinoNoSistema } from './redirecionar.ts';

describe('landing: endereços antigos do sistema', () => {
  it('etiqueta QR, links de senha e janela de processo vão para /app/', () => {
    expect(destinoNoSistema('', '#asset/at-1')).toBe('/app/#asset/at-1');
    expect(destinoNoSistema('', '#access_token=x&type=recovery')).toBe('/app/#access_token=x&type=recovery');
    expect(destinoNoSistema('?code=abc', '')).toBe('/app/?code=abc');
    expect(destinoNoSistema('?processo=tkt-1', '')).toBe('/app/?processo=tkt-1');
  });
  it('visita comum fica na landing', () => {
    expect(destinoNoSistema('', '')).toBeNull();
    expect(destinoNoSistema('', '#modulos')).toBeNull();
  });
});
