/**
 * Seção 28 · Primeiros passos da implantação (só o administrador, no Início).
 * Cada passo se marca sozinho conforme os dados existem e leva à tela certa.
 * Some quando tudo está feito; dá para esconder antes (lembrado neste navegador).
 */
import React, { useState } from 'react';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useRecursos } from '../../context/RecursosContext.tsx';

const CHAVE = 'nexus_primeiros_passos_oculto';

export const PrimeirosPassos: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { settings, departments, employees, fornecedores, contratos, licenses, assets, currentRole } = useApp();
  const { unidades, linhas } = useRecursos();
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem(CHAVE) === '1';
    } catch {
      return false;
    }
  });
  if (currentRole !== 'ti_admin' || oculto) return null;

  const ativos = employees.filter((e) => e.status !== 'desligado');
  const temPapel = (p: string) => ativos.some((e) => e.role === p);
  const premissas = settings.premissasFinanceiras || {};
  const passos: { titulo: string; detalhe: string; feito: boolean; ir: string }[] = [
    { titulo: 'Dados da empresa e logo', detalhe: 'Configurações › Empresa', feito: !!(settings.razaoSocial || settings.nomeFantasia) && !!settings.logoUrl, ir: 'settings' },
    // A unidade é opcional (só para quem tem mais de um endereço): o passo depende dos departamentos
    {
      titulo: 'Departamentos',
      detalhe: unidades.length ? 'O cadastro de pessoas exige o setor' : 'O cadastro de pessoas exige o setor · unidades só se houver mais de um endereço',
      feito: departments.length > 0,
      ir: 'settings',
    },
    { titulo: 'Premissas financeiras', detalhe: 'Limite de CAPEX, câmbio e contas contábeis', feito: Object.keys(premissas).length > 0, ir: 'settings' },
    {
      titulo: 'Usuários de T.I., RH e Compras',
      detalhe: 'Cadastre a pessoa e use "Criar acesso" (senha provisória na tela)',
      feito: temPapel('ti_suporte') && temPapel('rh') && temPapel('compras'),
      ir: 'collaborators',
    },
    // Ordem guiada (seção 28): quem cobra → softwares (importar) → contratos → linhas → pessoas e itens
    { titulo: 'Fornecedores principais', detalhe: 'Quem cobra: revenda, operadora, provedor de internet, suporte', feito: fornecedores.length > 0, ir: 'fornecedores' },
    {
      titulo: 'Softwares',
      detalhe: 'Em Softwares › "Importar do Microsoft 365 / Google" ou "Nova licença" com um modelo',
      feito: licenses.length > 0,
      ir: 'softwares',
    },
    { titulo: 'Contratos', detalhe: 'Internet, telefonia, suporte, locação: com eles as faturas são geradas sozinhas', feito: contratos.length > 0, ir: 'contratos' },
    { titulo: 'Linhas telefônicas', detalhe: 'Depois do contrato da operadora (ou avulsas, com valor mensal)', feito: linhas.length > 0, ir: 'linhas' },
    {
      titulo: 'Colaboradores e equipamentos',
      detalhe: 'Na ficha da pessoa: Entregar equipamento, Atribuir software, Entregar linha',
      feito: ativos.filter((e) => e.role === 'colaborador').length > 0 && assets.length > 0,
      ir: 'collaborators',
    },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  const esconder = () => {
    try {
      localStorage.setItem(CHAVE, '1');
    } catch {
      // sem armazenamento: esconde só nesta visita
    }
    setOculto(true);
  };

  return (
    <section className="cartao p-4 space-y-3" aria-label="Primeiros passos">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="secao-titulo">Primeiros passos da implantação</h3>
          <p className="texto-aux">
            {feitos} de {passos.length} feitos · cada passo se marca sozinho
          </p>
        </div>
        <button type="button" onClick={esconder} className="btn-icone" aria-label="Esconder os primeiros passos" title="Esconder">
          <X />
        </button>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {passos.map((p, i) => (
          <li key={p.titulo}>
            <button
              type="button"
              onClick={() => onNavigate(p.ir)}
              className="flex w-full items-start gap-2 rounded-lg border border-slate-200 p-2 text-left hover:border-blue-300 hover:bg-slate-50"
            >
              {p.feito ? <CheckCircle2 className="ico mt-0.5 shrink-0 text-emerald-600" /> : <Circle className="ico mt-0.5 shrink-0 text-slate-400" />}
              <span className="min-w-0">
                <span className={`block font-semibold ${p.feito ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                  {i + 1}. {p.titulo}
                </span>
                <span className="block texto-aux">{p.detalhe}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
