import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Janela } from '../ui/Janela.tsx';
import { CompanySettings } from '../../types/index.ts';

interface Props {
  settings: CompanySettings;
  onClose: () => void;
}

// Fase 3 · LGPD: aviso de privacidade aos colaboradores.
// ATENÇÃO: texto-base técnico. Deve ser revisado pelo jurídico / encarregado (DPO)
// antes de ser considerado a política oficial da empresa.
export const PoliticaPrivacidadeModal: React.FC<Props> = ({ settings, onClose }) => (
  <Janela tamanho="m" icone={<ShieldCheck className="h-4 w-4" />} titulo="Aviso de privacidade · Nexus IT & HR" idTitulo="politica-titulo" onFechar={onClose}>
      <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
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

        <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
          Texto-base preparado para revisão do jurídico / encarregado de dados da empresa.
        </p>
      </div>
  </Janela>
);
