/**
 * Seção 9.3 · Busca de CNPJ (BrasilAPI) e CEP (ViaCEP) para preencher cadastros.
 * Só ajuda: se a busca falhar (sem internet, CNPJ não encontrado), a pessoa
 * continua digitando à mão. Nada do Nexus é enviado além do número buscado.
 */
import { soDigitos } from '../utils/mascaras.ts';

export interface DadosCnpj {
  razaoSocial: string;
  nomeFantasia?: string;
  telefone?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  situacao?: string;
}

export interface DadosCep {
  endereco?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

async function buscarJson(url: string): Promise<Record<string, unknown> | null> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 8000);
  try {
    const r = await fetch(url, { signal: controle.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error(`O serviço de consulta respondeu ${r.status}.`);
    return (await r.json()) as Record<string, unknown>;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('A consulta demorou demais. Tente de novo ou preencha à mão.', { cause: err });
    throw new Error('Não foi possível consultar agora. Preencha à mão.', { cause: err });
  } finally {
    clearTimeout(prazo);
  }
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function buscarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const c = cnpj.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (c.length !== 14) throw new Error('Digite os 14 caracteres do CNPJ para buscar.');
  const d = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
  if (!d) return null;
  const tel = soDigitos(texto(d.ddd_telefone_1));
  const endereco = [texto(d.descricao_tipo_de_logradouro), texto(d.logradouro)].filter(Boolean).join(' ');
  return {
    razaoSocial: texto(d.razao_social) || '',
    nomeFantasia: texto(d.nome_fantasia),
    telefone: tel || undefined,
    email: texto(d.email)?.toLowerCase(),
    cep: texto(d.cep),
    endereco: [endereco, texto(d.numero), texto(d.complemento), texto(d.bairro)].filter(Boolean).join(', ') || undefined,
    cidade: texto(d.municipio),
    uf: texto(d.uf),
    situacao: texto(d.descricao_situacao_cadastral),
  };
}

export async function buscarCep(cep: string): Promise<DadosCep | null> {
  const c = soDigitos(cep);
  if (c.length !== 8) throw new Error('Digite os 8 dígitos do CEP para buscar.');
  const d = await buscarJson(`https://viacep.com.br/ws/${c}/json/`);
  if (!d || d.erro) return null;
  return { endereco: texto(d.logradouro), bairro: texto(d.bairro), cidade: texto(d.localidade), uf: texto(d.uf) };
}
