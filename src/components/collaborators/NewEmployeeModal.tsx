import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext.tsx';
import type { Employee, EmployeeStatus, TipoVinculo, UserRole } from '../../types/index.ts';
import { emailDaEmpresa, sugerirEmail } from '../../utils/emailEmpresa.ts';
import { UserPlus } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { confirmar } from '../ui/dialogo.tsx';
import { CampoMascara } from '../ui/Campos.tsx';
import { isoLocal } from '../../utils/formatters.ts';

/** Fase 10: dados que já vêm preenchidos (ex.: do chamado de admissão) */
export interface DadosIniciaisColaborador {
  nome?: string;
  email?: string;
  cargo?: string;
  setorId?: string;
  gestorId?: string;
  dataAdmissao?: string;
  /** Papel de acesso (só o admin de T.I. passa algo além de colaborador) */
  papel?: UserRole;
}

interface NewEmployeeModalProps {
  onClose: () => void;
  inicial?: DadosIniciaisColaborador;
  /** Chamado depois que o banco confirma o cadastro; sem ele, abre a ficha da pessoa */
  onCriado?: (colaboradorId: string) => void | Promise<void>;
  /** Editar dados de quem já está cadastrado (mesmo formulário) */
  colaborador?: Employee;
}

export const NewEmployeeModal: React.FC<NewEmployeeModalProps> = ({ onClose, inicial, onCriado, colaborador }) => {
  const { employees, departments, cadastrarColaborador, salvarColaborador, setSelectedEmployeeIdFor360, currentRole, settings } = useApp();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const editando = !!colaborador;
  // E-mail é a identidade da pessoa. Quem já tem login não troca o e-mail aqui
  // (derrubaria o acesso); sem login, a T.I. corrige. Perfis de gestão: só o admin.
  const temLogin = !!colaborador?.temLogin;
  const podeMudarEmail =
    !editando || (!temLogin && (currentRole === 'ti_admin' || (colaborador.role || 'colaborador') === 'colaborador'));
  // Desligado só volta a ativo pelo administrador de T.I.
  const desligado = colaborador?.status === 'desligado';
  const podeReativar = !desligado || currentRole === 'ti_admin';

  const nextMatricula = `NX-${1000 + employees.length + 1}`;

  const [nome, setNome] = useState(colaborador?.nome ?? inicial?.nome ?? '');
  const [email, setEmail] = useState(colaborador?.email ?? inicial?.email ?? '');
  const [matricula, setMatricula] = useState(colaborador?.matricula ?? nextMatricula);
  const [cargo, setCargo] = useState(colaborador?.cargo ?? inicial?.cargo ?? '');
  const [setorId, setSetorId] = useState(colaborador?.setorId || inicial?.setorId || departments[0]?.id || 'dep-1');
  const [gestorId, setGestorId] = useState(colaborador?.gestorId ?? inicial?.gestorId ?? '');
  const [status, setStatus] = useState<EmployeeStatus>(colaborador?.status ?? 'ativo');
  const [dataAdmissao, setDataAdmissao] = useState(
    colaborador?.dataAdmissao || inicial?.dataAdmissao || isoLocal(new Date())
  );
  const [telefone, setTelefone] = useState(colaborador?.telefone ?? '');
  // Seção 29: tipo de pessoa e e-mail sugerido pelo domínio da empresa
  const [tipo, setTipo] = useState<TipoVinculo>(colaborador?.tipoVinculo ?? 'colaborador');
  const externo = tipo === 'externo';
  const podeEscolherTipo = currentRole === 'ti_admin' || currentRole === 'ti_suporte';
  const dominios = settings.dominiosEmail || [];
  const [emailTocado, setEmailTocado] = useState(editando || !!inicial?.email);
  const usados = employees.filter((x) => x.id !== colaborador?.id).map((x) => x.email);
  const mudarNome = (v: string) => {
    setNome(v);
    if (!emailTocado && !externo && settings.padraoEmail !== 'nenhum') setEmail(sugerirEmail(v, settings.padraoEmail, dominios[0], usados));
  };
  const emailSugeridoRepetido = !emailTocado && !!email && usados.some((u) => u.toLowerCase() === email.replace(/\d+@/, '@').toLowerCase());
  const emailMudou = editando && email.trim().toLowerCase() !== colaborador.email;

  const activeEmployees = employees.filter((e) => e.status === 'ativo' && e.id !== colaborador?.id && e.tipoVinculo !== 'externo');

  // Edição: grava só o que mudou e só fecha depois do banco confirmar
  const salvarEdicao = async (tipoFinal: TipoVinculo = tipo) => {
    if (!colaborador) return;
    const novo = {
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      tipoVinculo: tipoFinal,
      cargo: cargo.trim() || (tipoFinal === 'externo' ? 'Usuário externo' : ''),
      setorId,
      gestorId: gestorId || undefined,
      status,
      dataAdmissao,
      telefone: telefone.trim() || undefined,
    };
    const mudou = (Object.keys(novo) as (keyof typeof novo)[]).filter((k) => (novo[k] || undefined) !== (colaborador[k] || undefined));
    if (mudou.length === 0) return onClose();
    if (
      desligado &&
      status !== 'desligado' &&
      !(await confirmar(
        `Reativar ${colaborador.nome}?\n\nA pessoa volta a aparecer como ativa. Se tinha login, o acesso ao sistema volta a funcionar.`
      ))
    ) {
      return;
    }
    setErro(null);
    setSalvando(true);
    const falha = await salvarColaborador(colaborador.id, Object.fromEntries(mudou.map((k) => [k, novo[k]])));
    setSalvando(false);
    if (falha) return setErro(`Não foi possível salvar: ${falha}`);
    onClose();
  };

  // Seção 29: e-mail fora do domínio num colaborador → pergunta se é usuário externo (não bloqueia)
  const conferirDominio = async (): Promise<TipoVinculo> => {
    if (externo || emailDaEmpresa(email, dominios) !== false) return tipo;
    if (editando && !emailMudou && colaborador?.tipoVinculo === tipo) return tipo;
    const externoAgora = await confirmar({
      titulo: 'E-mail fora do domínio da empresa',
      mensagem: `${email.trim()} não é de ${dominios.join(' ou ')}. É alguém de fora que só acessa o sistema (consultor, prestadora, administrador externo)? Usuário externo não entra na contagem de colaboradores nem nas listas de entrega.`,
      confirmar: 'Marcar como usuário externo',
      cancelar: 'É colaborador mesmo',
    });
    if (externoAgora) setTipo('externo');
    return externoAgora ? 'externo' : 'colaborador';
  };

  // Espera o banco confirmar: quem chamou (ex.: o checklist) usa o id logo em seguida
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || (!externo && !cargo.trim()) || salvando) return;
    const tipoFinal = podeEscolherTipo ? await conferirDominio() : tipo;
    if (editando) return salvarEdicao(tipoFinal);
    setErro(null);
    setSalvando(true);
    const ehExterno = tipoFinal === 'externo';
    const { colaborador, erro: falha } = await cadastrarColaborador({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      // Externo: matrícula, cargo e setor são opcionais (o banco exige matrícula e cargo: vão valores padrão)
      matricula: matricula.trim() || `EXT-${Date.now().toString().slice(-6)}`,
      cargo: cargo.trim() || (ehExterno ? 'Usuário externo' : ''),
      setorId: ehExterno && !setorId ? '' : setorId,
      gestorId: gestorId || undefined,
      status,
      dataAdmissao,
      telefone: telefone.trim(),
      tipoVinculo: tipoFinal,
      ...(inicial?.papel ? { role: inicial.papel } : {}),
    });
    setSalvando(false);
    if (!colaborador) return setErro(falha || 'Não foi possível cadastrar.');

    onClose();
    if (onCriado) await onCriado(colaborador.id);
    else setSelectedEmployeeIdFor360(colaborador.id);
  };

  // Em portal e acima das outras janelas: abre por cima do chamado sem ficar presa nele
  return createPortal(
    <Janela
      tamanho="m"
      icone={<UserPlus className="ico" />}
      titulo={editando ? `Editar dados de ${colaborador.nome}` : 'Novo colaborador'}
      onFechar={onClose}
      rodape={
        <>
          <button type="button" onClick={onClose} className="btn btn-secundario">
            Cancelar
          </button>
          <button type="submit" form="form-colaborador" disabled={salvando} className="btn btn-primario">
            {editando
              ? salvando
                ? 'Salvando…'
                : 'Salvar alterações'
              : salvando
                ? 'Cadastrando…'
                : onCriado
                  ? 'Cadastrar e concluir o passo'
                  : 'Cadastrar colaborador'}
          </button>
        </>
      }
    >
      <form id="form-colaborador" onSubmit={handleSubmit} className="space-y-4">
        {/* Seção 29: colaborador da empresa ou usuário externo (só a T.I. escolhe) */}
        {podeEscolherTipo && (
          <fieldset className="cartao space-y-2 p-4">
            <legend className="secao-titulo">Tipo de pessoa</legend>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="radio" name="colab-tipo" checked={!externo} onChange={() => setTipo('colaborador')} />
                Colaborador da empresa
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="radio" name="colab-tipo" checked={externo} onChange={() => setTipo('externo')} />
                Usuário externo (só acessa o sistema)
              </label>
            </div>
            {externo && (
              <p className="ajuda">
                Administrador de fora, consultor, técnico da prestadora, contador. Não entra na contagem de colaboradores, nas listas de entrega nem na admissão;
                matrícula, cargo e setor são opcionais.
              </p>
            )}
          </fieldset>
        )}
        <div className="cartao space-y-2 p-4">
          <h3 className="secao-titulo">Identificação e contato</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="colab-nome" className="rotulo">Nome completo *</label>
              <input id="colab-nome" type="text" required value={nome} onChange={(e) => mudarNome(e.target.value)} placeholder="Ex: Amanda Silva Castro" className="campo" />
            </div>
            <div>
              <label htmlFor="colab-matricula" className="rotulo">Matrícula funcional{externo ? '' : ' *'}</label>
              <input id="colab-matricula" type="text" required={!externo} value={matricula} disabled={editando} onChange={(e) => setMatricula(e.target.value)} className="campo font-mono" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="colab-email" className="rotulo">{externo ? 'E-mail *' : 'E-mail corporativo *'}</label>
              <input
                id="colab-email"
                type="email"
                required
                value={email}
                disabled={!podeMudarEmail}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailTocado(true);
                }}
                placeholder={dominios[0] && !externo ? `nome@${dominios[0]}` : 'nome@empresa.com.br'}
                className="campo"
              />
              {!emailTocado && email && !externo && (
                <p className="ajuda">Sugerido pelo padrão da empresa{emailSugeridoRepetido ? ' (o endereço comum já existe: número acrescentado)' : ''}. Pode editar.</p>
              )}
              {editando && temLogin && (
                <p className="ajuda">Esta pessoa já tem login. Para trocar o e-mail de quem já tem login, use "Trocar login" — em breve.</p>
              )}
              {editando && !temLogin && !podeMudarEmail && <p className="ajuda">Só o administrador de T.I. altera o e-mail de perfis de gestão.</p>}
              {emailMudou && (
                <p className="mt-1 text-amber-800">Confira o novo e-mail: ele será usado quando a pessoa receber o acesso ao sistema.</p>
              )}
            </div>
            <div>
              <label htmlFor="colab-telefone" className="rotulo">Telefone / ramal</label>
              <CampoMascara id="colab-telefone" tipo="telefone" value={telefone} onChange={setTelefone} placeholder="(11) 98765-0000 ou ramal 2345" />
            </div>
          </div>
        </div>

        {/* Entradas dinâmicas estritas (setor e gestor) */}
        <div className="cartao space-y-2 p-4">
          <h3 className="secao-titulo">Vínculo e situação</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label htmlFor="colab-cargo" className="rotulo">Cargo / função{externo ? '' : ' *'}</label>
              <input id="colab-cargo" type="text" required={!externo} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Engenheiro(a) de Software" className="campo" />
            </div>
            <div>
              <label htmlFor="colab-setor" className="rotulo">Setor / departamento{externo ? '' : ' *'}</label>
              <select id="colab-setor" value={setorId} onChange={(e) => setSetorId(e.target.value)} required={!externo} className="campo">
                {externo && <option value="">Sem setor</option>}
                {departments
                  .filter((d) => d.ativo)
                  .map((dep) => (
                    <option key={dep.id} value={dep.id}>
                      {dep.nome} ({dep.codigo})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="colab-gestor" className="rotulo">Líder imediato / gestor (ativo)</label>
              <select id="colab-gestor" value={gestorId} onChange={(e) => setGestorId(e.target.value)} className="campo">
                <option value="">Nenhum (Diretoria / Gestão Superior)</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nome} ({emp.cargo})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="colab-status" className="rotulo">Status</label>
              <select id="colab-status" value={status} disabled={!podeReativar} onChange={(e) => setStatus(e.target.value as EmployeeStatus)} className="campo">
                <option value="ativo">{desligado ? 'Ativo (reativar)' : 'Ativo'}</option>
                <option value="ferias">Férias</option>
                {/* Na edição, desligar é pelo processo de desligamento (recolhe equipamentos e acessos) */}
                {(!editando || desligado) && <option value="desligado">Desligado</option>}
              </select>
              {!podeReativar && <p className="ajuda">Só o administrador de T.I. reativa uma pessoa desligada.</p>}
            </div>
            <div>
              <label htmlFor="colab-admissao" className="rotulo">Data de admissão</label>
              <input id="colab-admissao" type="date" value={dataAdmissao} onChange={(e) => setDataAdmissao(e.target.value)} className="campo" />
            </div>
          </div>
        </div>

        {erro && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {erro}
          </p>
        )}
      </form>
    </Janela>,
    document.body
  );
};
