import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { X, Download, FileText, ShieldCheck, Send, CheckCircle2 } from 'lucide-react';
import { PoliticaPrivacidadeModal } from './PoliticaPrivacidadeModal.tsx';

interface Props {
  onClose: () => void;
}

type TipoPedido = 'correcao' | 'eliminacao';

// Fase 3 · LGPD (art. 18): acesso e portabilidade (download) e registro de pedidos do titular
export const MeusDadosModal: React.FC<Props> = ({ onClose }) => {
  const { currentUser, departments, assets, licenses, tickets, terms, settings, createTicket } = useApp();
  const [mostrarPolitica, setMostrarPolitica] = useState(false);
  const [pedido, setPedido] = useState<TipoPedido | null>(null);
  const [detalhe, setDetalhe] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [protocolo, setProtocolo] = useState<string | null>(null);

  if (!currentUser) return null;
  const meuId = currentUser.id;

  const handleBaixar = () => {
    // Só os dados do próprio titular, mesmo para quem é TI e enxerga mais
    const dados = {
      geradoEm: new Date().toISOString(),
      controlador: { razaoSocial: settings.razaoSocial, cnpj: settings.cnpj, contato: settings.emailTI },
      titular: {
        nome: currentUser.nome,
        email: currentUser.email,
        matricula: currentUser.matricula,
        cargo: currentUser.cargo,
        setor: departments.find((d) => d.id === currentUser.setorId)?.nome || null,
        status: currentUser.status,
        papelDeAcesso: currentUser.role,
        dataAdmissao: currentUser.dataAdmissao,
        telefone: currentUser.telefone || null,
      },
      equipamentosSobCustodia: assets
        .filter((a) => a.custodianteId === meuId)
        .map((a) => ({ tag: a.tag, nome: a.nome, marca: a.marca, modelo: a.modelo, serie: a.serialNumber, desde: a.dataEntregaAtual })),
      historicoDeCustodia: assets.flatMap((a) =>
        a.historicoCustodia
          .filter((h) => h.colaboradorId === meuId)
          .map((h) => ({ tag: a.tag, equipamento: a.nome, entrega: h.dataEntrega, devolucao: h.dataDevolucao || null, motivo: h.motivoDevolucao || null }))
      ),
      licencas: licenses.filter((l) => l.colaboradoresIds.includes(meuId)).map((l) => ({ software: l.nome, fornecedor: l.fornecedor })),
      chamados: tickets
        .filter((t) => t.solicitanteId === meuId)
        .map((t) => ({
          codigo: t.codigo,
          titulo: t.titulo,
          status: t.status,
          abertoEm: t.dataCriacao,
          mensagens: t.mensagens.filter((m) => !m.ehNotaInterna).map((m) => ({ autor: m.autorNome, data: m.data, texto: m.texto })),
        })),
      termos: terms
        .filter((t) => t.colaboradorId === meuId)
        .map((t) => ({ codigo: t.codigo, tipo: t.tipo, emitidoEm: t.dataEmissao, status: t.statusAssinatura })),
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meus-dados-${currentUser.matricula}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleEnviarPedido = async () => {
    if (!pedido) return;
    setEnviando(true);
    const titulo = pedido === 'correcao' ? 'LGPD: pedido de correção de dados' : 'LGPD: pedido de anonimização / eliminação de dados';
    const descricao =
      `Pedido do titular ${currentUser.nome} (${currentUser.matricula}) com base no art. 18 da LGPD.\n` +
      `Tipo: ${pedido === 'correcao' ? 'correção de dados incompletos, inexatos ou desatualizados' : 'anonimização ou eliminação de dados'}.\n` +
      (detalhe.trim() ? `Detalhes: ${detalhe.trim()}\n` : '') +
      'Prazo de referência para resposta: 15 dias (art. 19, II).';
    const criado = await createTicket({
      tipo: 'suporte',
      solicitanteId: currentUser.id,
      solicitanteNome: currentUser.nome,
      solicitanteEmail: currentUser.email,
      solicitanteCargo: currentUser.cargo,
      solicitanteSetorNome: departments.find((d) => d.id === currentUser.setorId)?.nome || 'Setor',
      titulo,
      categoria: 'LGPD - Direitos do titular',
      prioridade: 'alta',
      status: 'aberto',
      descricao,
      anexos: [],
    });
    setEnviando(false);
    if (criado) {
      setProtocolo(criado.codigo);
      setPedido(null);
      setDetalhe('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-slate-900/50 overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Meus dados (LGPD)</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-xs text-slate-700">
          <div className="space-y-2">
            <h3 className="font-semibold text-slate-900">Cópia dos seus dados</h3>
            <p>Baixe um arquivo com seu cadastro, equipamentos, licenças, chamados e termos.</p>
            <button
              type="button"
              onClick={handleBaixar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <Download className="w-3.5 h-3.5" /> Baixar meus dados (.json)
            </button>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-slate-900">Fazer um pedido</h3>
            {protocolo && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Pedido registrado no chamado {protocolo}. A T.I. responde por lá.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPedido('correcao')}
                className={`px-3 py-1.5 rounded-lg border ${pedido === 'correcao' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                Corrigir meus dados
              </button>
              <button
                type="button"
                onClick={() => setPedido('eliminacao')}
                className={`px-3 py-1.5 rounded-lg border ${pedido === 'eliminacao' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300 hover:bg-slate-50'}`}
              >
                Anonimizar / eliminar
              </button>
            </div>
            {pedido && (
              <div className="space-y-2">
                {pedido === 'eliminacao' && (
                  <p className="text-xs text-slate-500">
                    Enquanto houver vínculo ou obrigação legal (termos de equipamentos, por exemplo), os dados são mantidos. Quando
                    cabível, a T.I. anonimiza o cadastro e preserva o histórico sem identificar você.
                  </p>
                )}
                <textarea
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  rows={3}
                  placeholder={pedido === 'correcao' ? 'O que está errado e qual o valor correto?' : 'Algum detalhe para a T.I.? (opcional)'}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleEnviarPedido}
                  disabled={enviando || (pedido === 'correcao' && !detalhe.trim())}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" /> {enviando ? 'Registrando...' : 'Registrar pedido'}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setMostrarPolitica(true)} className="inline-flex items-center gap-1.5 text-blue-700 hover:underline">
              <FileText className="w-3.5 h-3.5" /> Ler o aviso de privacidade
            </button>
          </div>
        </div>
      </div>
      {mostrarPolitica && <PoliticaPrivacidadeModal settings={settings} onClose={() => setMostrarPolitica(false)} />}
    </div>
  );
};
