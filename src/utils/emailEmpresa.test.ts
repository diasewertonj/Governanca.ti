import { describe, expect, it } from 'vitest';
import { dominioDe, emailDaEmpresa, sugerirEmail, usuarioDoEmail } from './emailEmpresa.ts';

describe('e-mail da empresa', () => {
  it('domínio a partir do site ou do e-mail', () => {
    expect(dominioDe('https://www.SuaEmpresa.com.br/contato')).toBe('suaempresa.com.br');
    expect(dominioDe('ti@suaempresa.com.br')).toBe('suaempresa.com.br');
    expect(dominioDe('')).toBe('');
  });

  it('padrões: nome.sobrenome (último sobrenome, sem partícula e sem acento), nome + inicial, só o nome', () => {
    expect(usuarioDoEmail('Ana Paula de Souza', 'nome.sobrenome')).toBe('ana.souza');
    expect(usuarioDoEmail('João Conceição', 'nome.inicial')).toBe('joaoc');
    expect(usuarioDoEmail('Márcio Andrade', 'nome')).toBe('marcio');
    expect(usuarioDoEmail('Márcio Andrade', 'nenhum')).toBe('');
  });

  it('não repete endereço já usado e sem domínio não sugere', () => {
    expect(sugerirEmail('Ana Souza', 'nome.sobrenome', 'x.com.br', ['ana.souza@x.com.br'])).toBe('ana.souza2@x.com.br');
    expect(sugerirEmail('Ana Souza', 'nome.sobrenome', undefined, [])).toBe('');
  });

  it('confere o domínio só quando há domínios cadastrados', () => {
    expect(emailDaEmpresa('a@x.com.br', ['x.com.br'])).toBe(true);
    expect(emailDaEmpresa('a@gmail.com', ['x.com.br'])).toBe(false);
    expect(emailDaEmpresa('a@gmail.com', [])).toBeUndefined();
  });
});
