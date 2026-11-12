import { describe, expect, it } from 'vitest';
import {
  camposAlterados,
  DbError,
  formatarTamanho,
  mensagemDeErro,
  TAMANHO_MAXIMO_ARQUIVO,
  validarArquivo,
} from './supabaseDb.ts';

describe('camposAlterados (UPDATE só do que mudou · ALTO-04)', () => {
  it('devolve só as colunas com valor diferente', () => {
    expect(camposAlterados({ id: '1', nome: 'A', status: 'aberto' }, { id: '1', nome: 'B', status: 'aberto' })).toEqual({
      nome: 'B',
    });
  });

  it('trata null e undefined como iguais', () => {
    expect(camposAlterados({ telefone: null }, { telefone: undefined })).toEqual({});
  });

  it('compara objetos JSON por conteúdo', () => {
    expect(camposAlterados({ fiscal: { nf: '1' } }, { fiscal: { nf: '1' } })).toEqual({});
    expect(camposAlterados({ fiscal: { nf: '1' } }, { fiscal: { nf: '2' } })).toEqual({ fiscal: { nf: '2' } });
  });
});

describe('mensagemDeErro (CRIT-04: erro do banco chega ao usuário)', () => {
  it('esconde mensagens técnicas de RLS', () => {
    expect(mensagemDeErro({ code: '42501', message: 'new row violates row-level security policy for table "chamados"' })).toBe(
      'sem permissão para esta ação'
    );
  });

  it('mostra regras de negócio escritas nas funções do banco', () => {
    expect(mensagemDeErro({ code: '23514', message: 'Este desligamento já foi concluído' })).toBe(
      'Este desligamento já foi concluído'
    );
    expect(mensagemDeErro({ code: '42501', message: 'Apenas a T.I. conclui desligamentos' })).toBe(
      'Apenas a T.I. conclui desligamentos'
    );
  });

  it('traduz violação de CHECK, chave duplicada e vínculo', () => {
    expect(mensagemDeErro({ code: '23514', message: 'new row for relation "chamados" violates check constraint' })).toBe(
      'valor não aceito pelo banco'
    );
    expect(mensagemDeErro({ code: '23505', message: 'duplicate key value violates unique constraint' })).toMatch(/já existe/);
    expect(mensagemDeErro({ code: '23503', message: 'x' })).toMatch(/vinculado/);
  });

  it('mostra a mensagem de validação de arquivo', () => {
    expect(mensagemDeErro(new DbError('"a.html": tipo não aceito.', 'validacao'))).toBe('"a.html": tipo não aceito.');
  });

  it('tem texto padrão para falha sem mensagem', () => {
    expect(mensagemDeErro(undefined)).toBe('falha de comunicação com o banco');
  });
});

describe('validarArquivo (Storage privado · MED-04)', () => {
  const arquivo = (nome: string, tipo: string, tamanho = 10) => new File([new Uint8Array(tamanho)], nome, { type: tipo });

  it('aceita PDF e imagens', () => {
    expect(validarArquivo(arquivo('a.pdf', 'application/pdf'))).toBeNull();
    expect(validarArquivo(arquivo('a.png', 'image/png'))).toBeNull();
  });

  it('recusa HTML e executáveis', () => {
    expect(validarArquivo(arquivo('a.html', 'text/html'))).toMatch(/tipo não aceito/);
    expect(validarArquivo(arquivo('a.exe', 'application/x-msdownload'))).toMatch(/tipo não aceito/);
  });

  it('recusa acima de 10 MB', () => {
    expect(validarArquivo(arquivo('a.pdf', 'application/pdf', TAMANHO_MAXIMO_ARQUIVO + 1))).toMatch(/10 MB/);
  });
});

describe('formatarTamanho', () => {
  it('formata KB e MB', () => {
    expect(formatarTamanho(500)).toBe('1 KB');
    expect(formatarTamanho(226424)).toBe('221 KB');
    expect(formatarTamanho(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
