import React, { useState } from 'react';
import { ResponsibilityTerm } from '../../types/index.ts';
import { useApp } from '../../context/AppContext.tsx';
import { formatDate } from '../../utils/formatters.ts';
import { Printer, X, CheckCircle2, Upload, FileText, Building2 } from 'lucide-react';

interface PrintableTermModalProps {
  term: ResponsibilityTerm;
  onClose: () => void;
}

export const PrintableTermModal: React.FC<PrintableTermModalProps> = ({ term, onClose }) => {
  const { settings, assets, markTermSigned } = useApp();
  const [uploadingSigned, setUploadingSigned] = useState(false);
  const [uploadedSuccess, setUploadedSuccess] = useState(false);

  // Buscar detalhes dos ativos incluídos no termo
  const termAssets = assets.filter((a) => term.ativoIds.includes(a.id));

  const handlePrint = () => {
    window.print();
  };

  const handleSimulateUploadSigned = () => {
    setUploadingSigned(true);
    setTimeout(() => {
      markTermSigned(term.id, 'https://cdn.nexuscorp.com.br/termos/scan-assinado.pdf');
      setUploadingSigned(false);
      setUploadedSuccess(true);
      setTimeout(() => setUploadedSuccess(false), 3000);
    }, 700);
  };

  const isEntrega = term.tipo === 'entrega';
  const tituloTermo = isEntrega
    ? 'TERMO DE RESPONSABILIDADE E ENTREGA DE EQUIPAMENTOS'
    : 'TERMO DE DEVOLUÇÃO E BAIXA PATRIMONIAL DE EQUIPAMENTOS';

  const textoClausula = isEntrega ? settings.textoTermoEntrega : settings.textoTermoDevolucao;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Barra Superior de Ações (Oculta na impressão) */}
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                {term.codigo} · {tituloTermo}
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Formato formal A4 pronto para impressão física ou arquivamento digital
            </p>
          </div>

          <div className="flex items-center gap-2">
            {term.statusAssinatura === 'assinado' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Termo Assinado & Arquivado
              </span>
            ) : (
              <button
                type="button"
                onClick={handleSimulateUploadSigned}
                disabled={uploadingSigned}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingSigned ? 'Anexando...' : 'Anexar Termo Assinado (Scan)'}
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir A4
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {uploadedSuccess && (
          <div className="no-print bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Cópia digitalizada anexada com sucesso à ficha do colaborador e histórico do ativo!
          </div>
        )}

        {/* Folha A4 Formatada */}
        <div className="p-8 md:p-12 bg-white max-h-[75vh] overflow-y-auto print:max-h-none print:p-0">
          <div className="print-a4-page mx-auto text-slate-800 text-xs leading-relaxed space-y-6">
            {/* Cabeçalho Institucional da Empresa */}
            <div className="border-b border-slate-300 pb-5 flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                    N
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                      {settings.razaoSocial}
                    </h1>
                    <p className="text-[11px] text-slate-500 font-medium">{settings.nomeFantasia}</p>
                  </div>
                </div>
                <div className="pt-2 text-[11px] text-slate-600 space-y-0.5">
                  <p>CNPJ: {settings.cnpj} · Departamento de Tecnologia da Informação (T.I.)</p>
                  <p>{settings.endereco} · {settings.cidadeUF} · CEP {settings.cep}</p>
                  <p>Contato T.I.: {settings.emailTI} · {settings.telefoneTI}</p>
                </div>
              </div>

              <div className="text-right">
                <span className="font-mono text-xs font-semibold text-blue-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                  {term.codigo}
                </span>
                <p className="text-[11px] text-slate-400 mt-2">Data de Emissão</p>
                <p className="text-xs font-medium text-slate-700">{formatDate(term.dataEmissao)}</p>
              </div>
            </div>

            {/* Título Central */}
            <div className="text-center py-2">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {tituloTermo}
              </h2>
            </div>

            {/* Qualificação do Colaborador (Beneficiário) */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-1">
                1. Qualificação do Colaborador (Custodiante)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Nome Completo</span>
                  <span className="font-semibold text-slate-900">{term.colaboradorNome}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Matrícula</span>
                  <span className="font-mono text-slate-800">{term.colaboradorMatricula}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cargo</span>
                  <span className="text-slate-800">{term.colaboradorCargo}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Setor / Departamento</span>
                  <span className="text-slate-800">{term.colaboradorSetorNome}</span>
                </div>
              </div>
            </div>

            {/* Tabela de Equipamentos Envolvidos */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                2. Relação de Equipamentos e Ativos
              </h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[11px] text-slate-600 uppercase font-semibold">
                      <th className="py-2 px-3">Patrimônio</th>
                      <th className="py-2 px-3">Descrição / Modelo</th>
                      <th className="py-2 px-3">Marca</th>
                      <th className="py-2 px-3">Número de Série</th>
                      <th className="py-2 px-3">Estado Físico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {termAssets.length > 0 ? (
                      termAssets.map((asset) => (
                        <tr key={asset.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{asset.tag}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{asset.nome}</td>
                          <td className="py-2.5 px-3">{asset.marca}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{asset.serialNumber}</td>
                          <td className="py-2.5 px-3 text-slate-600">Perfeito funcionamento, sem avarias</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          Nenhum equipamento listado neste termo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cláusula Legal de Responsabilidade */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                3. Cláusulas de Compromisso e Responsabilidade
              </h3>
              <div className="p-3.5 bg-slate-50/50 border border-slate-200 rounded-lg text-[11px] text-slate-600 text-justify leading-relaxed">
                {textoClausula}
              </div>
            </div>

            {term.observacoes && (
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Observações adicionais:</span> {term.observacoes}
              </div>
            )}

            {/* Local, Data e Assinaturas Formais */}
            <div className="pt-6 space-y-8">
              <p className="text-right text-[11px] text-slate-500">
                {settings.cidadeUF}, {formatDate(term.dataEmissao)}.
              </p>

              <div className="grid grid-cols-2 gap-12 pt-8">
                <div className="text-center space-y-1">
                  <div className="border-b border-slate-400 w-3/4 mx-auto pb-1 mb-1">
                    {term.statusAssinatura === 'assinado' && (
                      <span className="text-[10px] text-emerald-600 font-mono italic">
                        [Assinado Digitalmente / Documento Original Arquivado]
                      </span>
                    )}
                  </div>
                  <p className="font-bold text-slate-900 text-xs">{term.colaboradorNome}</p>
                  <p className="text-[10px] text-slate-500">Colaborador(a) / Solicitante</p>
                  <p className="text-[10px] text-slate-400 font-mono">CPF / Matrícula: {term.colaboradorMatricula}</p>
                </div>

                <div className="text-center space-y-1">
                  <div className="border-b border-slate-400 w-3/4 mx-auto pb-1 mb-1">
                    <span className="text-[10px] text-blue-600 font-mono italic">
                      [Visto Técnico de TI]
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 text-xs">{term.responsavelTINome}</p>
                  <p className="text-[10px] text-slate-500">Responsável T.I. / Patrimônio</p>
                  <p className="text-[10px] text-slate-400">{settings.nomeFantasia}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
