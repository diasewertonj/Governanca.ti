import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { TicketPriority, TicketAttachment } from '../../types/index.ts';
import { X, Paperclip, Send } from 'lucide-react';
import {
  enviarAnexoDb,
  formatarTamanho,
  mensagemDeErro,
  removerArquivosDb,
  TIPOS_ARQUIVO_ACEITOS,
  validarArquivo,
} from '../../services/supabaseDb.ts';
import { confirmarDescarte } from '../comum/BarraAlteracoes.tsx';
import { useRegistrarPendencias } from '../../hooks/usePendencias.ts';

// Anexo escolhido, ainda só no navegador (Fase 5: sobe apenas ao enviar o chamado)
interface AnexoPendente {
  id: string;
  nome: string;
  tamanho: string;
  arquivo: File;
}

interface NewTicketModalProps {
  onClose: () => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({ onClose }) => {
  const { currentUser, supabaseUser, departments, assets, licenses, createTicket, setSelectedTicketIdForDetail } = useApp();
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [enviandoChamado, setEnviandoChamado] = useState(false);

  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('Hardware / Equipamento');
  const [prioridade, setPrioridade] = useState<TicketPriority>('media');
  const [objetoSelecionado, setObjetoSelecionado] = useState<string>('');
  const [descricao, setDescricao] = useState('');
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);

  // Fase 5: chamado em preenchimento conta como alteração não salva
  const preenchido = titulo.trim() !== '' || descricao.trim() !== '' || anexos.length > 0;
  const itensPendentes = preenchido
    ? [`Chamado novo não enviado${anexos.length ? ` (${anexos.length} anexo(s))` : ''}`]
    : [];
  useRegistrarPendencias('novo-chamado', itensPendentes);

  const fechar = () => {
    if (enviandoChamado) return;
    if (confirmarDescarte(itensPendentes)) onClose();
  };

  if (!currentUser) return null;

  const userDepartment = departments.find((d) => d.id === currentUser.setorId);

  // Equipamentos em posse do solicitante
  const myCustodyAssets = assets.filter((a) => a.custodianteId === currentUser.id);

  // Softwares alocados para o solicitante
  const myLicenses = licenses.filter((l) => l.colaboradoresIds.includes(currentUser.id));
  const otherLicenses = licenses.filter((l) => !l.colaboradoresIds.includes(currentUser.id));

  // Fase 5: escolher arquivo só valida tipo/tamanho; o envio ao Storage
  // acontece ao clicar em "Enviar Chamado" (cancelar não deixa arquivo órfão)
  const handleSelecionarArquivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (arquivos.length === 0) return;
    const validos: AnexoPendente[] = [];
    const erros: string[] = [];
    for (const arquivo of arquivos) {
      const erro = validarArquivo(arquivo);
      if (erro) erros.push(erro);
      else validos.push({ id: crypto.randomUUID(), nome: arquivo.name, tamanho: formatarTamanho(arquivo.size), arquivo });
    }
    setErroAnexo(erros.length ? erros.join(' ') : null);
    setAnexos((prev) => [...prev, ...validos]);
  };

  /** Sobe os anexos; se algum falhar, apaga os que já subiram e devolve null */
  const enviarAnexos = async (): Promise<TicketAttachment[] | null> => {
    const enviados: TicketAttachment[] = [];
    for (const a of anexos) {
      try {
        enviados.push(await enviarAnexoDb(a.arquivo, supabaseUser?.id));
      } catch (err) {
        setErroAnexo(`Não foi possível enviar "${a.nome}": ${mensagemDeErro(err)}. O chamado não foi aberto.`);
        await removerArquivosDb(enviados.flatMap((x) => (x.caminho ? [x.caminho] : []))).catch(() => undefined);
        return null;
      }
    }
    return enviados;
  };

  const handleRemoveAttachment = (attId: string) => {
    setAnexos(anexos.filter((a) => a.id !== attId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim()) return;

    let ativoId: string | undefined = undefined;
    let softwareId: string | undefined = undefined;
    let softwareNome: string | undefined = undefined;

    if (objetoSelecionado.startsWith('asset:')) {
      ativoId = objetoSelecionado.replace('asset:', '');
    } else if (objetoSelecionado.startsWith('software:')) {
      softwareId = objetoSelecionado.replace('software:', '');
      softwareNome = licenses.find((l) => l.id === softwareId)?.nome;
    }

    if (enviandoChamado || enviandoAnexo) return;
    setEnviandoChamado(true);
    setEnviandoAnexo(anexos.length > 0);
    const anexosEnviados = await enviarAnexos();
    setEnviandoAnexo(false);
    if (!anexosEnviados) {
      setEnviandoChamado(false);
      return;
    }
    const created = await createTicket({
      tipo: 'suporte',
      solicitanteId: currentUser.id,
      solicitanteNome: currentUser.nome,
      solicitanteEmail: currentUser.email,
      solicitanteCargo: currentUser.cargo,
      solicitanteSetorNome: userDepartment?.nome || 'Setor',
      ativoId,
      softwareId,
      softwareNome,
      titulo: titulo.trim(),
      categoria,
      prioridade,
      status: 'aberto',
      descricao: descricao.trim(),
      anexos: anexosEnviados,
    });
    setEnviandoChamado(false);
    if (!created) {
      // Chamado recusado: apaga os anexos que subiram (o modal fica aberto para tentar de novo)
      await removerArquivosDb(anexosEnviados.flatMap((x) => (x.caminho ? [x.caminho] : []))).catch(() => undefined);
      return;
    }
    setAnexos([]);

    onClose();
    setSelectedTicketIdForDetail(created.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto overscroll-contain modal-tela">
      <div className="relative w-full max-w-2xl bg-white rounded-none sm:rounded-xl min-h-[100dvh] sm:min-h-0 shadow-2xl border border-slate-200 sm:overflow-hidden my-0 sm:my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Abrir chamado</h2>
            <p className="text-xs text-slate-500">
              Solicitação interna de suporte vinculada ao perfil corporativo
            </p>
          </div>
          <button
            onClick={fechar}
            className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 sm:max-h-[75vh] sm:overflow-y-auto">
          {/* Card com preenchimento automático do Solicitante */}
          <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.nome.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {currentUser.nome} <span className="font-mono text-slate-500 font-normal">({currentUser.matricula})</span>
                </p>
                <p className="text-xs text-slate-600">
                  {currentUser.cargo} · {userDepartment?.nome || 'Setor'}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 shadow-2xs">
              Solicitante Identificado
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Título Resumido do Chamado
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Teclado falhando teclas específicas ou tela piscando na docking"
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descrição Detalhada do Problema
            </label>
            <textarea
              required
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva quando o problema começou, se há mensagens de erro na tela e os passos para reproduzir a falha..."
              className="w-full text-xs p-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Vínculo Dinâmico ao Ativo Físico ou Software/SaaS */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Objeto do Chamado (Equipamento Físico ou Software / SaaS)
            </label>
            <select
              value={objetoSelecionado}
              onChange={(e) => {
                const val = e.target.value;
                setObjetoSelecionado(val);
                if (val.startsWith('software:')) {
                  setCategoria('Software / Acesso a Sistemas');
                } else if (val.startsWith('asset:')) {
                  setCategoria('Hardware / Equipamento');
                }
              }}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Nenhum item específico (Dúvida geral / Solicitação de novo acesso)</option>

              {/* Grupo 1: Equipamentos em posse do solicitante */}
              {myCustodyAssets.length > 0 && (
                <optgroup label="Meus Equipamentos sob Custódia (Hardware 1:1)">
                  {myCustodyAssets.map((asset) => (
                    <option key={asset.id} value={`asset:${asset.id}`}>
                      💻 {asset.tag} · {asset.nome} ({asset.marca} - S/N: {asset.serialNumber})
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Grupo 2: Softwares alocados ao solicitante */}
              {myLicenses.length > 0 && (
                <optgroup label="Minhas Licenças & Softwares em Uso (SaaS)">
                  {myLicenses.map((lic) => (
                    <option key={lic.id} value={`software:${lic.id}`}>
                      🔑 {lic.nome} ({lic.fornecedor})
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Grupo 3: Demais Softwares Corporativos */}
              {otherLicenses.length > 0 && (
                <optgroup label="Outros Softwares Corporativos da Empresa">
                  {otherLicenses.map((lic) => (
                    <option key={lic.id} value={`software:${lic.id}`}>
                      🌐 {lic.nome} ({lic.fornecedor})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Vincule o chamado ao equipamento físico ou software afetado para agilizar o suporte técnico da T.I.
            </p>
          </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Categoria do Problema
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="Hardware / Equipamento">Hardware / Equipamento Físico</option>
                <option value="Periféricos / Telas / Cabos">Periféricos / Telas / Cabos</option>
                <option value="Softwares & Licenças">Softwares & Licenças</option>
                <option value="Rede / VPN / Wi-Fi">Rede / VPN / Wi-Fi</option>
                <option value="Acessos & E-mail">Acessos & E-mail Corporativo</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prioridade Informada
              </label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as TicketPriority)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="baixa">Baixa (Dúvida ou solicitação sem impacto)</option>
                <option value="media">Média (Impacto parcial no trabalho diário)</option>
                <option value="alta">Alta (Impossibilita atividades principais)</option>
                <option value="critica">Urgente (Bloqueio total / Falha crítica de máquina)</option>
              </select>
            </div>
          </div>

          {/* Anexos de Arquivos / Prints de Erro */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700">
              Anexos (Prints de erro, fotos do estado físico, logs)
            </label>

            <div className="flex items-center gap-3">
              <label
                className={`px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                  enviandoAnexo ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Paperclip className="w-3.5 h-3.5" />
                Escolher arquivos
                <input
                  type="file"
                  multiple
                  accept={TIPOS_ARQUIVO_ACEITOS.join(',')}
                  onChange={handleSelecionarArquivos}
                  className="sr-only"
                />
              </label>
              <span className="text-xs text-slate-500">PDF, PNG, JPG, WEBP ou TXT · até 10 MB cada</span>
            </div>
            {erroAnexo && <p className="text-xs text-rose-700">{erroAnexo}</p>}

            {anexos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {anexos.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200"
                  >
                    <Paperclip className="w-3 h-3 text-slate-500" />
                    <span>{att.nome}</span>
                    <span className="text-xs text-slate-500">({att.tamanho})</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-500 hover:text-rose-600 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={fechar}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviandoChamado || enviandoAnexo}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar Chamado para T.I.
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
