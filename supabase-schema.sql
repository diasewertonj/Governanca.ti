-- ==============================================================================
-- NEXUS IT & HR - SCHEMA DE PRODUÇÃO POSTGRESQL (SUPABASE DDL)
-- ==============================================================================
-- Execute este script no SQL Editor do seu Dashboard Supabase:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Departamentos / Setores
CREATE TABLE IF NOT EXISTS public.departamentos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    codigo TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    responsavel_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Colaboradores
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id TEXT PRIMARY KEY,
    matricula TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    cargo TEXT NOT NULL,
    setor_id TEXT REFERENCES public.departamentos(id) ON DELETE SET NULL,
    gestor_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('ativo', 'ferias', 'desligado')),
    role TEXT NOT NULL DEFAULT 'colaborador' CHECK (role IN ('colaborador', 'rh', 'ti_suporte', 'ti_admin')),
    data_admissao DATE NOT NULL,
    telefone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar chave estrangeira autorreferencial para gestor
ALTER TABLE public.colaboradores 
    DROP CONSTRAINT IF EXISTS fk_colaborador_gestor,
    ADD CONSTRAINT fk_colaborador_gestor FOREIGN KEY (gestor_id) REFERENCES public.colaboradores(id) ON DELETE SET NULL;

-- 4. Tabela de Ativos de TI
CREATE TABLE IF NOT EXISTS public.ativos (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL CHECK (categoria IN ('hardware', 'software', 'periferico', 'telefonia')),
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('disponivel', 'em_uso', 'manutencao', 'descartado')),
    localizacao_fisica TEXT NOT NULL,
    custodiante_id TEXT REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    data_entrega_atual DATE,
    sistema_operacional TEXT,
    bitlocker_key TEXT,
    fiscal JSONB DEFAULT '{}'::jsonb,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Tabela de Histórico de Custódia (Rastreabilidade 360°)
CREATE TABLE IF NOT EXISTS public.historico_custodia (
    id TEXT PRIMARY KEY,
    ativo_id TEXT NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
    colaborador_id TEXT NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    colaborador_nome TEXT NOT NULL,
    data_entrega DATE NOT NULL,
    data_devolucao DATE,
    motivo_devolucao TEXT,
    termo_id TEXT,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Tabela de Licenças de Software / Assinaturas SaaS
CREATE TABLE IF NOT EXISTS public.licencas_software (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    fornecedor TEXT NOT NULL,
    chave_contrato TEXT NOT NULL,
    assentos_totais INTEGER NOT NULL DEFAULT 1,
    colaboradores_ids JSONB DEFAULT '[]'::jsonb,
    valor_mensal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    tipo_cobranca TEXT DEFAULT 'mensal' CHECK (tipo_cobranca IN ('mensal', 'anual')),
    data_renovacao DATE NOT NULL,
    url_painel TEXT,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Tabela de Chamados do Service Desk
CREATE TABLE IF NOT EXISTS public.chamados (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('suporte', 'onboarding', 'offboarding')),
    categoria TEXT NOT NULL,
    prioridade TEXT NOT NULL CHECK (prioridade IN ('baixa', 'media', 'alta', 'critica')),
    status TEXT NOT NULL CHECK (status IN ('aberto', 'em_andamento', 'aguardando_terceiro', 'resolvido', 'cancelado')),
    solicitante_id TEXT NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    solicitante_nome TEXT NOT NULL,
    solicitante_email TEXT NOT NULL,
    solicitante_cargo TEXT NOT NULL,
    solicitante_setor_nome TEXT NOT NULL,
    tecnico_responsavel_id TEXT REFERENCES public.colaboradores(id) ON DELETE SET NULL,
    tecnico_responsavel_nome TEXT,
    ativo_id TEXT REFERENCES public.ativos(id) ON DELETE SET NULL,
    software_id TEXT REFERENCES public.licencas_software(id) ON DELETE SET NULL,
    software_nome TEXT,
    onboarding JSONB,
    offboarding JSONB,
    anexos JSONB DEFAULT '[]'::jsonb,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Tabela de Mensagens e Notas Internas de Chamados
CREATE TABLE IF NOT EXISTS public.chamado_mensagens (
    id TEXT PRIMARY KEY,
    chamado_id TEXT NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
    autor_id TEXT NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    autor_nome TEXT NOT NULL,
    autor_papel TEXT NOT NULL,
    texto TEXT NOT NULL,
    data_envio TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    eh_nota_interna BOOLEAN NOT NULL DEFAULT false,
    anexos JSONB DEFAULT '[]'::jsonb
);

-- 9. Tabela de Termos de Responsabilidade
CREATE TABLE IF NOT EXISTS public.termos_responsabilidade (
    id TEXT PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrega', 'devolucao')),
    colaborador_id TEXT NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
    colaborador_nome TEXT NOT NULL,
    colaborador_matricula TEXT NOT NULL,
    colaborador_cargo TEXT NOT NULL,
    colaborador_setor_nome TEXT NOT NULL,
    ativo_ids JSONB DEFAULT '[]'::jsonb,
    data_emissao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    data_assinatura TIMESTAMP WITH TIME ZONE,
    status_assinatura TEXT NOT NULL CHECK (status_assinatura IN ('gerado', 'assinado', 'recusado')),
    arquivo_url TEXT,
    responsavel_ti_id TEXT NOT NULL,
    responsavel_ti_nome TEXT NOT NULL
);

-- 10. Tabela de Configurações Institucionais da Empresa
CREATE TABLE IF NOT EXISTS public.configuracoes_empresa (
    id TEXT PRIMARY KEY DEFAULT 'config_principal',
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    endereco TEXT NOT NULL,
    cidade_uf TEXT NOT NULL,
    cep TEXT NOT NULL,
    email_ti TEXT NOT NULL,
    telefone_ti TEXT NOT NULL,
    texto_termo_entrega TEXT NOT NULL,
    texto_termo_devolucao TEXT NOT NULL,
    campos_personalizados JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS) - SEGURANÇA POR PAPEL
-- ==============================================================================
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_custodia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencas_software ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamado_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termos_responsabilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_empresa ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública/Autenticada para o Nexus IT & HR
CREATE POLICY "Leitura autenticada de setores" ON public.departamentos FOR SELECT USING (true);
CREATE POLICY "Leitura pública configuracoes" ON public.configuracoes_empresa FOR SELECT USING (true);
CREATE POLICY "Leitura autenticada colaboradores" ON public.colaboradores FOR SELECT USING (true);
CREATE POLICY "Leitura ativos" ON public.ativos FOR SELECT USING (true);
CREATE POLICY "Leitura historico" ON public.historico_custodia FOR SELECT USING (true);
CREATE POLICY "Leitura licencas" ON public.licencas_software FOR SELECT USING (true);
CREATE POLICY "Leitura chamados" ON public.chamados FOR SELECT USING (true);
CREATE POLICY "Leitura mensagens" ON public.chamado_mensagens FOR SELECT USING (true);
CREATE POLICY "Leitura termos" ON public.termos_responsabilidade FOR SELECT USING (true);

-- Permissões de gravação para a aplicação
CREATE POLICY "Gravacao departamentos" ON public.departamentos FOR ALL USING (true);
CREATE POLICY "Gravacao colaboradores" ON public.colaboradores FOR ALL USING (true);
CREATE POLICY "Gravacao ativos" ON public.ativos FOR ALL USING (true);
CREATE POLICY "Gravacao historico" ON public.historico_custodia FOR ALL USING (true);
CREATE POLICY "Gravacao licencas" ON public.licencas_software FOR ALL USING (true);
CREATE POLICY "Gravacao chamados" ON public.chamados FOR ALL USING (true);
CREATE POLICY "Gravacao mensagens" ON public.chamado_mensagens FOR ALL USING (true);
CREATE POLICY "Gravacao termos" ON public.termos_responsabilidade FOR ALL USING (true);
CREATE POLICY "Gravacao configuracoes" ON public.configuracoes_empresa FOR ALL USING (true);
