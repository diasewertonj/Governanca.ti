/**
 * Seção 9.3 · Campos que ajudam sem travar (padrão 8.6: classes `campo`, `ajuda`).
 *  - CampoMascara: CNPJ, CEP, telefone, chave NF-e, IMEI, MAC, ICCID — formata ao
 *    digitar e, ao sair do campo, só AVISA se o dado não bater (salva assim mesmo).
 *  - CampoCnpj / CampoCep: o mesmo, com busca (BrasilAPI / ViaCEP) para preencher.
 *  - CampoMoeda: R$ com milhar e centavos ("6.850,00"); devolve número.
 *  - CampoSugestoes: texto livre com lista de sugestões (fabricantes, tipos...).
 */
import React, { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { MASCARAS, aplicarMascara, avisoMascara, digitandoMoeda, textoDaMoeda, valorDaMoeda, type TipoMascara } from '../../utils/mascaras.ts';
import { buscarCep, buscarCnpj, type DadosCep, type DadosCnpj } from '../../services/consultas.ts';

type PropsInput = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

export const CampoMascara: React.FC<
  PropsInput & {
    tipo: TipoMascara;
    value: string;
    onChange: (v: string) => void;
    /** Botão ao lado (ex.: Buscar) */
    depois?: React.ReactNode;
    /** Mensagem extra abaixo (ex.: resultado da busca) */
    nota?: React.ReactNode;
  }
> = ({ tipo, value, onChange, depois, nota, className = 'campo', onBlur, ...resto }) => {
  const def = MASCARAS[tipo];
  const [tocado, setTocado] = useState(false);
  const aviso = tocado ? avisoMascara(tipo, value) : null;
  const idAviso = useId();
  const input = (
    <input
      {...resto}
      type="text"
      inputMode={def.inputMode}
      autoComplete="off"
      spellCheck={false}
      placeholder={resto.placeholder ?? def.placeholder}
      value={value}
      onChange={(e) => onChange(aplicarMascara(tipo, e.target.value))}
      onBlur={(e) => {
        setTocado(true);
        onBlur?.(e);
      }}
      aria-describedby={aviso ? idAviso : undefined}
      className={`${className} font-mono`}
    />
  );
  return (
    <>
      {depois ? (
        <div className="flex gap-2">
          {input}
          {depois}
        </div>
      ) : (
        input
      )}
      {aviso && (
        <p id={idAviso} className="ajuda text-amber-800">
          {aviso}
        </p>
      )}
      {nota}
    </>
  );
};

/** CNPJ com "Buscar": preenche razão social, telefone, e-mail e endereço (só o que estiver vazio, a critério de quem chama) */
export const CampoCnpj: React.FC<PropsInput & { value: string; onChange: (v: string) => void; onAchado: (d: DadosCnpj) => void }> = ({
  value,
  onChange,
  onAchado,
  ...resto
}) => {
  const [estado, setEstado] = useState<{ buscando?: boolean; msg?: string; ok?: boolean }>({});
  const buscar = async () => {
    setEstado({ buscando: true });
    try {
      const d = await buscarCnpj(value);
      if (!d) return setEstado({ msg: 'CNPJ não encontrado na Receita. Confira o número ou preencha à mão.' });
      onAchado(d);
      setEstado({ ok: true, msg: `Encontrado: ${d.razaoSocial}${d.situacao && d.situacao !== 'ATIVA' ? ` (situação: ${d.situacao.toLowerCase()})` : ''}. Confira os campos preenchidos.` });
    } catch (err) {
      setEstado({ msg: (err as Error).message });
    }
  };
  return (
    <CampoMascara
      {...resto}
      tipo="cnpj"
      value={value}
      onChange={(v) => {
        onChange(v);
        if (estado.msg) setEstado({});
      }}
      depois={
        <button type="button" onClick={buscar} disabled={estado.buscando || value.replace(/[^0-9A-Za-z]/g, '').length !== 14} className="btn btn-secundario shrink-0" title="Buscar dados do CNPJ na Receita (BrasilAPI)">
          <Search /> {estado.buscando ? 'Buscando…' : 'Buscar'}
        </button>
      }
      nota={estado.msg ? <p className={`ajuda ${estado.ok ? 'text-emerald-800' : 'text-amber-800'}`}>{estado.msg}</p> : undefined}
    />
  );
};

/** CEP que busca o endereço sozinho ao completar 8 dígitos (e no botão) */
export const CampoCep: React.FC<PropsInput & { value: string; onChange: (v: string) => void; onAchado: (d: DadosCep) => void }> = ({
  value,
  onChange,
  onAchado,
  ...resto
}) => {
  const [estado, setEstado] = useState<{ buscando?: boolean; msg?: string; ok?: boolean }>({});
  const buscar = async (cep: string) => {
    setEstado({ buscando: true });
    try {
      const d = await buscarCep(cep);
      if (!d) return setEstado({ msg: 'CEP não encontrado. Confira ou preencha o endereço à mão.' });
      onAchado(d);
      setEstado({ ok: true, msg: `Endereço encontrado: ${[d.endereco, d.cidade, d.uf].filter(Boolean).join(', ')}.` });
    } catch (err) {
      setEstado({ msg: (err as Error).message });
    }
  };
  return (
    <CampoMascara
      {...resto}
      tipo="cep"
      value={value}
      onChange={(v) => {
        const completou = v.replace(/\D/g, '').length === 8 && value.replace(/\D/g, '').length !== 8;
        onChange(v);
        if (completou) void buscar(v);
        else if (estado.msg) setEstado({});
      }}
      depois={
        <button type="button" onClick={() => buscar(value)} disabled={estado.buscando || value.replace(/\D/g, '').length !== 8} className="btn btn-secundario shrink-0" title="Buscar endereço pelo CEP (ViaCEP)">
          <Search /> {estado.buscando ? 'Buscando…' : 'Buscar'}
        </button>
      }
      nota={estado.msg ? <p className={`ajuda ${estado.ok ? 'text-emerald-800' : 'text-amber-800'}`}>{estado.msg}</p> : undefined}
    />
  );
};

/** R$ com milhar e centavos; vazio = undefined */
export const CampoMoeda: React.FC<
  Omit<PropsInput, 'min' | 'step'> & { valor?: number; onMudar: (v: number | undefined) => void; /** "R$" (padrão), "US$", "€" */ simbolo?: string }
> = ({ valor, onMudar, simbolo = 'R$', className = 'campo', onBlur, ...resto }) => {
  // Texto em edição; null = mostra o valor recebido formatado
  const [texto, setTexto] = useState<string | null>(null);
  const exibido = texto ?? textoDaMoeda(valor);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 texto-aux" aria-hidden="true">
        {simbolo}
      </span>
      <input
        {...resto}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={exibido}
        placeholder={resto.placeholder ?? '0,00'}
        onChange={(e) => {
          const novo = e.target.value;
          const colado = novo.length - exibido.length > 1;
          const t = digitandoMoeda(novo, colado);
          setTexto(t);
          onMudar(valorDaMoeda(t));
        }}
        onBlur={(e) => {
          setTexto(null);
          onBlur?.(e);
        }}
        className={`${className} ${simbolo.length > 2 ? 'pl-10' : 'pl-8'} text-right font-mono`}
      />
    </div>
  );
};

/** Texto livre com sugestões (datalist): fabricantes, tipos, capacidades... */
export const CampoSugestoes: React.FC<PropsInput & { value: string; onChange: (v: string) => void; sugestoes: string[] }> = ({
  value,
  onChange,
  sugestoes,
  className = 'campo',
  ...resto
}) => {
  const idLista = useId();
  return (
    <>
      <input {...resto} type="text" list={idLista} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} className={className} />
      <datalist id={idLista}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
};
