import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import {
  X,
  User,
  Laptop,
  History,
  FileText,
  Key,
  ExternalLink,
  PlusCircle,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Mail,
  Phone,
} from 'lucide-react';

interface Employee360ModalProps {
  employeeId: string;
  onClose: () => void;
}

export const Employee360Modal: React.FC<Employee360ModalProps> = ({ employeeId, onClose }) => {
  const {
    employees,
    departments,
    assets,
    licenses,
    terms,
    setSelectedAssetIdFor360,
    setSelectedTermForPrint,
    createTerm,
    currentUser,
    currentRole,
    anonimizarColaborador,
    acessoNexus,
  } = useApp();

  const [termSuccess, setTermSuccess] = useState<string | null>(null);
  const [anonimizando, setAnonimizando] = useState(false);
  // Fase 7: senha provisória fora do onboarding (esqueceu a senha; não depende de e-mail)
  const [gerandoSenha, setGerandoSenha] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const handleSenhaProvisoria = async () => {
    const nome = employee?.nome || 'este colaborador';
    if (!window.confirm(`Gerar uma senha provisória para ${nome}?\n\nSe a pessoa já tem login, a senha atual deixa de valer.`)) return;
    setGerandoSenha(true);
    setSenhaGerada(null);
    setErroSenha(null);
    let r = await acessoNexus(employeeId, 'redefinir');
    // Ainda sem login: cria o acesso com o e-mail do cadastro
    if ('erro' in r && /ainda não tem acesso/i.test(r.erro)) r = await acessoNexus(employeeId, 'criar');
    setGerandoSenha(false);
    if ('erro' in r) setErroSenha(r.erro);
    else setSenhaGerada(r);
  };

  // Fase 3 · LGPD: só ti_admin, só desligados; preserva a trilha sem identificar a pessoa
  const handleAnonimizar = async () => {
    if (!employee) return;
    const ok = window.confirm(
      `Anonimizar os dados pessoais de ${employee.nome}?\n\n` +
        'Nome, e-mail, matrícula e telefone serão substituídos em todo o sistema (cadastro, histórico, chamados e termos). ' +
        'O histórico de equipamentos e chamados continua existindo, sem identificar a pessoa.\n\nNão é possível desfazer.'
    );
    if (!ok) return;
    setAnonimizando(true);
    const feito = await anonimizarColaborador(employee.id);
    setAnonimizando(false);
    if (feito) setTermSuccess('Dados pessoais anonimizados. O histórico foi preservado sem identificação.');
  };

  const employee = employees.find((e) => e.id === employeeId);

  // AUDITORIA RBAC: Colaborador comum só pode visualizar a sua própria ficha cadastral
  const isUnauthorized = currentRole === 'colaborador' && employeeId !== currentUser?.id;

  if (!employee) return null;

  if (isUnauthorized) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="bg-white rounded-xl max-w-md w-full p-6 text-center space-y-4 shadow-xl border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Acesso Restrito ao Perfil</h3>
            <p className="text-xs text-slate-500 mt-1">
              Por políticas de governança e privacidade de dados da empresa, colaboradores comuns têm acesso apenas à sua própria ficha e inventário pessoal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const department = departments.find((d) => d.id === employee.setorId);
  const manager = employees.find((e) => e.id === employee.gestorId);

  // Ativos atualmente em posse do colaborador
  const currentAssets = assets.filter((a) => a.custodianteId === employee.id);

  // Histórico de ativos já devolvidos pelo colaborador
  const returnedHistory = assets.flatMap((asset) => {
    return asset.historicoCustodia
      .filter((entry) => entry.colaboradorId === employee.id && entry.dataDevolucao)
      .map((entry) => ({
        asset,
        entry,
      }));
  });

  // Licenças de software alocadas
  const assignedLicenses = licenses.filter((lic) => lic.colaboradoresIds.includes(employee.id));

  // Termos gerados para o colaborador
  const employeeTerms = terms.filter((t) => t.colaboradorId === employee.id);

  const handleOpenAsset = (assetId: string) => {
    onClose();
    setSelectedAssetIdFor360(assetId);
  };

  const handleGenerateTerm = async (tipo: 'entrega' | 'devolucao') => {
    if (currentAssets.length === 0 && tipo === 'entrega') {
      alert('O colaborador não possui equipamentos vinculados para gerar o termo.');
      return;
    }

    const newTerm = await createTerm({
      tipo,
      colaboradorId: employee.id,
      colaboradorNome: employee.nome,
      colaboradorMatricula: employee.matricula,
      colaboradorCargo: employee.cargo,
      colaboradorSetorNome: department?.nome || 'Setor',
      ativoIds: currentAssets.map((a) => a.id),
      statusAssinatura: 'gerado',
      responsavelTIId: currentUser?.id || 'emp-1',
      responsavelTINome: currentUser?.nome || 'Responsável T.I.',
    });
    if (!newTerm) return; // o erro já aparece no aviso global

    setTermSuccess(`Termo ${newTerm.codigo} gerado com sucesso!`);
    setTimeout(() => setTermSuccess(null), 3000);
    setSelectedTermForPrint(newTerm);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              {employee.nome.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">{employee.nome}</h2>
                <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {employee.matricula}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-md font-medium border ${
                    employee.status === 'ativo'
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : employee.status === 'ferias'
                      ? 'text-amber-700 bg-amber-50 border-amber-200'
                      : 'text-slate-500 bg-slate-100 border-slate-200'
                  }`}
                >
                  {employee.status === 'ativo' ? 'Ativo' : employee.status === 'ferias' ? 'Férias' : 'Desligado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {employee.cargo} · {department?.nome || 'Departamento'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentRole === 'ti_admin' && employee.status === 'desligado' && !employee.email.endsWith('@anonimizado.invalid') && (
              <button
                type="button"
                onClick={handleAnonimizar}
                disabled={anonimizando}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors disabled:opacity-50"
              >
                {anonimizando ? 'Anonimizando...' : 'Anonimizar dados (LGPD)'}
              </button>
            )}
            {(currentRole === 'ti_admin' || currentRole === 'ti_suporte') && employee.status !== 'desligado' && (
              <button
                type="button"
                onClick={handleSenhaProvisoria}
                disabled={gerandoSenha}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {gerandoSenha ? 'Gerando...' : 'Senha provisória'}
              </button>
            )}
            {(currentRole === 'ti_admin' || currentRole === 'ti_suporte') && employee.status !== 'desligado' && (
              <button
                type="button"
                onClick={() => handleGenerateTerm('entrega')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Gerar termo de entrega
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {(senhaGerada || erroSenha) && (
          <div
            className={`px-6 py-3 text-sm border-b flex flex-wrap items-center gap-2 ${
              senhaGerada ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {senhaGerada ? (
              <>
                <span>
                  Login <span className="font-mono">{senhaGerada.email}</span> · senha provisória (aparece só agora):
                </span>
                <code className="px-2 py-0.5 bg-white border border-emerald-300 rounded font-mono tracking-wider select-all">
                  {senhaGerada.senha}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(senhaGerada.senha)}
                  className="text-xs font-semibold underline"
                >
                  Copiar
                </button>
                <span className="text-xs w-full">No primeiro login o sistema pede uma senha nova.</span>
              </>
            ) : (
              <span>{erroSenha}</span>
            )}
            <button
              type="button"
              onClick={() => {
                setSenhaGerada(null);
                setErroSenha(null);
              }}
              className="ml-auto text-xs font-semibold"
            >
              Fechar
            </button>
          </div>
        )}

        {termSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {termSuccess}
          </div>
        )}

        {/* Conteúdo com Scroll */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Card Resumo Institucional e Contatos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50/70 border border-slate-200 rounded-lg text-xs">
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold block">E-mail Corporativo</span>
              <span className="font-medium text-slate-800 flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 text-slate-500" />
                {employee.email}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold block">Líder Imediato / Gestor</span>
              {manager ? (
                <span className="font-medium text-blue-700 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-blue-500" />
                  {manager.nome}
                </span>
              ) : (
                <span className="text-slate-500 mt-0.5 block">Diretoria / Sem gestor</span>
              )}
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold block">Data de Admissão</span>
              <span className="text-slate-700 block mt-0.5">{formatDate(employee.dataAdmissao)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-500 uppercase font-semibold block">Telefone / Ramal</span>
              <span className="text-slate-700 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3 text-slate-500" />
                {employee.telefone || '-'}
              </span>
            </div>
          </div>

          {/* 1. Tabela de Ativos Atualmente em Posse (Rastreabilidade 360°) */}
          <div className="border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Equipamentos Atualmente sob Custódia ({currentAssets.length})
                </h3>
              </div>
              <span className="text-xs text-slate-500">Relação estrita 1:1</span>
            </div>

            {currentAssets.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {currentAssets.map((asset) => (
                  <div key={asset.id} className="py-3 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-md transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {asset.tag}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenAsset(asset.id)}
                          className="font-semibold text-xs text-slate-900 hover:text-blue-700 flex items-center gap-1 truncate"
                        >
                          {asset.nome}
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {asset.marca} {asset.modelo} · S/N: <span className="font-mono">{asset.serialNumber}</span> · Em posse desde: {formatDate(asset.dataEntregaAtual)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenAsset(asset.id)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded border border-slate-200 transition-colors shrink-0"
                    >
                      Ver Ficha do Ativo
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs">
                Nenhum equipamento físico alocado no momento para este colaborador.
              </div>
            )}
          </div>

          {/* 2. Licenças de Software & Acessos em Uso */}
          <div className="border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Key className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Licenças de Software & Contas ({assignedLicenses.length})
              </h3>
            </div>

            {assignedLicenses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assignedLicenses.map((lic) => (
                  <div key={lic.id} className="p-3 bg-slate-50/70 border border-slate-200 rounded-md flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{lic.nome}</p>
                      <p className="text-xs text-slate-500">{lic.fornecedor} · Contrato: {lic.chaveContrato}</p>
                    </div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Assento Ativo
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">Nenhuma licença vinculada.</p>
            )}
          </div>

          {/* 3. Documentos e Termos de Responsabilidade */}
          <div className="border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Termos de Responsabilidade & Devolução ({employeeTerms.length})
                </h3>
              </div>
            </div>

            {employeeTerms.length > 0 ? (
              <div className="divide-y divide-slate-100 text-xs">
                {employeeTerms.map((term) => (
                  <div key={term.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{term.codigo}</span>
                        <span className="capitalize font-medium text-slate-700">
                          Termo de {term.tipo === 'entrega' ? 'Entrega' : 'Devolução'}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            term.statusAssinatura === 'assinado'
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : 'text-amber-700 bg-amber-50 border-amber-200'
                          }`}
                        >
                          {term.statusAssinatura === 'assinado' ? 'Assinado' : 'Pendente de Assinatura'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Emitido em {formatDate(term.dataEmissao)} por {term.responsavelTINome}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedTermForPrint(term)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Visualizar / Imprimir A4
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2">Nenhum termo emitido para este colaborador ainda.</p>
            )}
          </div>

          {/* 4. Histórico de Devoluções Passadas */}
          {returnedHistory.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <History className="w-4 h-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Histórico de Equipamentos Já Devolvidos
                </h3>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {returnedHistory.map(({ asset, entry }) => (
                  <div key={entry.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {asset.nome} ({asset.tag})
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Período: {formatDate(entry.dataEntrega)} até {formatDate(entry.dataDevolucao)}
                      </p>
                      {entry.motivoDevolucao && (
                        <p className="text-xs text-slate-600 italic mt-0.5">
                          Motivo: {entry.motivoDevolucao}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded">
                      Retornado ao Estoque
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
