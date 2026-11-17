import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { Download, FileText, ShieldCheck, Send, CheckCircle2 } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
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
    <>
      <Janela
        tamanho="m"
        icone={<ShieldCheck className="h-4 w-4" />}
        titulo="Meus dados (LGPD)"
        subtitulo="Cópia dos seus dados e pedidos do titular"
        onFechar={onClose}
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div>
            <button type="button" onClick={() => setMostrarPolitica(true)} className="link inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Ler o aviso de privacidade
            </button>
          </div>

          <div className="cartao space-y-2 p-4">
            <h3 className="secao-titulo">Cópia dos seus dados</h3>
            <p>Baixe um arquivo com seu cadastro, equipamentos, licenças, chamados e termos.</p>
            <button type="button" onClick={handleBaixar} className="btn btn-primario btn-sm">
              <Download /> Baixar meus dados (.json)
            </button>
          </div>

          <div className="cartao space-y-2 p-4">
            <h3 className="secao-titulo">Fazer um pedido</h3>
            {protocolo && (
              <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Pedido registrado no chamado {protocolo}. A T.I. responde por lá.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={pedido === 'correcao'}
                onClick={() => setPedido('correcao')}
                className={`btn btn-sm ${pedido === 'correcao' ? 'btn-primario' : 'btn-secundario'}`}
              >
                Corrigir meus dados
              </button>
              <button
                type="button"
                aria-pressed={pedido === 'eliminacao'}
                onClick={() => setPedido('eliminacao')}
                className={`btn btn-sm ${pedido === 'eliminacao' ? 'btn-primario' : 'btn-secundario'}`}
              >
                Anonimizar / eliminar
              </button>
            </div>
            {pedido && (
              <div className="space-y-2">
                {pedido === 'eliminacao' && (
                  <p className="ajuda">
                    Enquanto houver vínculo ou obrigação legal (termos de equipamentos, por exemplo), os dados são mantidos. Quando
                    cabível, a T.I. anonimiza o cadastro e preserva o histórico sem identificar você.
                  </p>
                )}
                <label htmlFor="lgpd-detalhe" className="sr-only">
                  Detalhes do pedido
                </label>
                <textarea
                  id="lgpd-detalhe"
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value)}
                  rows={3}
                  placeholder={pedido === 'correcao' ? 'O que está errado e qual o valor correto?' : 'Algum detalhe para a T.I.? (opcional)'}
                  className="campo"
                />
                <button
                  type="button"
                  onClick={handleEnviarPedido}
                  disabled={enviando || (pedido === 'correcao' && !detalhe.trim())}
                  className="btn btn-secundario btn-sm"
                >
                  <Send /> {enviando ? 'Registrando...' : 'Registrar pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      </Janela>
      {mostrarPolitica && <PoliticaPrivacidadeModal settings={settings} onClose={() => setMostrarPolitica(false)} />}
    </>
  );
};

