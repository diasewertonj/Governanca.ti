import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { CompanySettings } from '../../types/index.ts';

interface Props {
  settings: CompanySettings;
  onClose: () => void;
}

// Fase 3 · LGPD: aviso de privacidade aos colaboradores.
// ATENÇÃO: texto-base técnico. Deve ser revisado pelo jurídico / encarregado (DPO)
// antes de ser considerado a política oficial da empresa.
export const PoliticaPrivacidadeModal: React.FC<Props> = ({ settings, onClose }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto">
    <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 my-6">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">Aviso de privacidade · Nexus IT & HR</h2>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-5 space-y-4 text-xs text-slate-700 leading-relaxed">
        <p>
          <strong>Controlador:</strong> {settings.razaoSocial} (CNPJ {settings.cnpj}). Contato para assuntos de dados pessoais:{' '}
          <strong>{settings.emailTI}</strong>.
        </p>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Quais dados tratamos</h3>
          <p>
            Dados de identificação e vínculo profissional (nome, e-mail corporativo, matrícula, cargo, setor, gestor, datas de
            admissão e desligamento, telefone), registros de equipamentos e licenças sob sua responsabilidade, termos de
            responsabilidade, chamados de suporte com seus anexos, e registros de acesso ao sistema.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Para que e com qual base legal (LGPD, art. 7º)</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Gestão de equipamentos, acessos e suporte técnico: <em>execução de contrato</em> de trabalho (inc. V).</li>
            <li>Termos de responsabilidade e controle patrimonial: <em>cumprimento de obrigação legal</em> e <em>exercício regular de direitos</em> (inc. II e VI).</li>
            <li>Segurança da informação e trilha de auditoria: <em>legítimo interesse</em> (inc. IX).</li>
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Quem acessa</h3>
          <p>
            Cada pessoa vê apenas os próprios dados. A equipe de T.I. acessa o necessário para suporte e gestão de ativos; o RH
            acessa dados de cadastro e processos de admissão e desligamento. Os dados ficam no Supabase (banco e arquivos
            privados) e o site é hospedado na Vercel.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Por quanto tempo</h3>
          <p>
            Enquanto durar o vínculo e, depois, pelo prazo necessário para obrigações legais e defesa de direitos. Após esse
            prazo, ou a pedido do titular quando cabível, os dados são <em>anonimizados</em>: o histórico de equipamentos e
            chamados é mantido sem identificar a pessoa.
          </p>
        </section>

        <section>
          <h3 className="font-semibold text-slate-900 mb-1">Seus direitos (LGPD, art. 18)</h3>
          <p>
            Confirmar e acessar seus dados, corrigir, pedir anonimização ou eliminação, e obter cópia. No menu do seu nome, em{' '}
            <strong>“Meus dados (LGPD)”</strong>, você baixa uma cópia e registra pedidos, que são atendidos pela T.I.
          </p>
        </section>

        <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
          Texto-base preparado para revisão do jurídico / encarregado de dados da empresa.
        </p>
      </div>
    </div>
  </div>
);
