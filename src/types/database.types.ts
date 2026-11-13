export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ativo_anexos: {
        Row: {
          ativo_id: string
          baixa_id: string | null
          caminho: string
          categoria: string
          criado_em: string
          criado_por: string | null
          id: string
          manutencao_id: string | null
          nome: string
          tamanho: number | null
          tipo: string | null
        }
        Insert: {
          ativo_id: string
          baixa_id?: string | null
          caminho: string
          categoria: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          manutencao_id?: string | null
          nome: string
          tamanho?: number | null
          tipo?: string | null
        }
        Update: {
          ativo_id?: string
          baixa_id?: string | null
          caminho?: string
          categoria?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          manutencao_id?: string | null
          nome?: string
          tamanho?: number | null
          tipo?: string | null
        }
        Relationships: []
      }
      ativo_baixas: {
        Row: {
          ativo_id: string
          criado_em: string
          criado_por: string | null
          data_baixa: string
          destinatario: string | null
          destino: string
          documento: string | null
          estornada_em: string | null
          estornada_por: string | null
          id: string
          motivo: string
          motivo_estorno: string | null
          observacoes: string | null
          valor_venda: number | null
        }
        Insert: {
          ativo_id: string
          criado_em?: string
          criado_por?: string | null
          data_baixa?: string
          destinatario?: string | null
          destino: string
          documento?: string | null
          estornada_em?: string | null
          estornada_por?: string | null
          id?: string
          motivo: string
          motivo_estorno?: string | null
          observacoes?: string | null
          valor_venda?: number | null
        }
        Update: {
          ativo_id?: string
          criado_em?: string
          criado_por?: string | null
          data_baixa?: string
          destinatario?: string | null
          destino?: string
          documento?: string | null
          estornada_em?: string | null
          estornada_por?: string | null
          id?: string
          motivo?: string
          motivo_estorno?: string | null
          observacoes?: string | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ativo_baixas_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativo_baixas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativo_baixas_estornada_por_fkey"
            columns: ["estornada_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos: {
        Row: {
          categoria: string
          created_at: string
          custodiante_id: string | null
          custom_fields: Json | null
          data_entrega_atual: string | null
          fiscal: Json | null
          fornecedor_id: string | null
          id: string
          localizacao_fisica: string
          marca: string
          modelo: string
          nome: string
          observacoes: string | null
          serial_number: string
          setor_id: string | null
          sistema_operacional: string | null
          status: string
          tag: string
        }
        Insert: {
          categoria: string
          created_at?: string
          custodiante_id?: string | null
          custom_fields?: Json | null
          data_entrega_atual?: string | null
          fiscal?: Json | null
          fornecedor_id?: string | null
          id: string
          localizacao_fisica: string
          marca: string
          modelo: string
          nome: string
          observacoes?: string | null
          serial_number: string
          setor_id?: string | null
          sistema_operacional?: string | null
          status: string
          tag: string
        }
        Update: {
          categoria?: string
          created_at?: string
          custodiante_id?: string | null
          custom_fields?: Json | null
          data_entrega_atual?: string | null
          fiscal?: Json | null
          fornecedor_id?: string | null
          id?: string
          localizacao_fisica?: string
          marca?: string
          modelo?: string
          nome?: string
          observacoes?: string | null
          serial_number?: string
          setor_id?: string | null
          sistema_operacional?: string | null
          status?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativos_custodiante_id_fkey"
            columns: ["custodiante_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos_segredos: {
        Row: {
          ativo_id: string
          bitlocker_key: string | null
          updated_at: string
        }
        Insert: {
          ativo_id: string
          bitlocker_key?: string | null
          updated_at?: string
        }
        Update: {
          ativo_id?: string
          bitlocker_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativos_segredos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: true
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_mensagens: {
        Row: {
          anexos: Json | null
          autor_id: string
          autor_nome: string
          autor_papel: string
          chamado_id: string
          data_envio: string
          eh_nota_interna: boolean
          id: string
          texto: string
        }
        Insert: {
          anexos?: Json | null
          autor_id: string
          autor_nome: string
          autor_papel: string
          chamado_id: string
          data_envio?: string
          eh_nota_interna?: boolean
          id: string
          texto: string
        }
        Update: {
          anexos?: Json | null
          autor_id?: string
          autor_nome?: string
          autor_papel?: string
          chamado_id?: string
          data_envio?: string
          eh_nota_interna?: boolean
          id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamado_mensagens_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamado_mensagens_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
        ]
      }
      chamado_eventos: {
        Row: { autor_id: string | null; chamado_id: string; criado_em: string; de: string | null; detalhe: string | null; id: string; para: string | null; tipo: string }
        Insert: { autor_id?: string | null; chamado_id: string; criado_em?: string; de?: string | null; detalhe?: string | null; id?: string; para?: string | null; tipo: string }
        Update: { autor_id?: string | null; chamado_id?: string; criado_em?: string; de?: string | null; detalhe?: string | null; id?: string; para?: string | null; tipo?: string }
        Relationships: []
      }
      chamados: {
        Row: {
          colaborador_id: string | null
          resolucao_causa: string | null
          resolucao_solucao: string | null
          resolucao_tipo: string | null
          resolucao_proximo_passo: string | null
          resolucao_tempo_min: number | null
          resolvido_por: string | null
          resolvido_em: string | null
          cancelamento_motivo: string | null
          cancelamento_detalhe: string | null
          cancelado_por: string | null
          reaberturas: number
          avaliacao: number | null
          avaliacao_comentario: string | null
          aguardando_motivo: string | null
          primeira_resposta_em: string | null
          anexos: Json | null
          ativo_id: string | null
          categoria: string
          codigo: string
          data_atualizacao: string
          data_criacao: string
          descricao: string
          id: string
          offboarding: Json | null
          onboarding: Json | null
          prioridade: string
          software_id: string | null
          software_nome: string | null
          solicitante_cargo: string
          solicitante_email: string
          solicitante_id: string
          solicitante_nome: string
          solicitante_setor_nome: string
          status: string
          tecnico_responsavel_id: string | null
          tecnico_responsavel_nome: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          colaborador_id?: string | null
          resolucao_causa?: string | null
          resolucao_solucao?: string | null
          resolucao_tipo?: string | null
          resolucao_proximo_passo?: string | null
          resolucao_tempo_min?: number | null
          resolvido_por?: string | null
          resolvido_em?: string | null
          cancelamento_motivo?: string | null
          cancelamento_detalhe?: string | null
          cancelado_por?: string | null
          reaberturas?: number
          avaliacao?: number | null
          avaliacao_comentario?: string | null
          aguardando_motivo?: string | null
          primeira_resposta_em?: string | null
          anexos?: Json | null
          ativo_id?: string | null
          categoria: string
          codigo: string
          data_atualizacao?: string
          data_criacao?: string
          descricao: string
          id: string
          offboarding?: Json | null
          onboarding?: Json | null
          prioridade: string
          software_id?: string | null
          software_nome?: string | null
          solicitante_cargo: string
          solicitante_email: string
          solicitante_id: string
          solicitante_nome: string
          solicitante_setor_nome: string
          status: string
          tecnico_responsavel_id?: string | null
          tecnico_responsavel_nome?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          colaborador_id?: string | null
          resolucao_causa?: string | null
          resolucao_solucao?: string | null
          resolucao_tipo?: string | null
          resolucao_proximo_passo?: string | null
          resolucao_tempo_min?: number | null
          resolvido_por?: string | null
          resolvido_em?: string | null
          cancelamento_motivo?: string | null
          cancelamento_detalhe?: string | null
          cancelado_por?: string | null
          reaberturas?: number
          avaliacao?: number | null
          avaliacao_comentario?: string | null
          aguardando_motivo?: string | null
          primeira_resposta_em?: string | null
          anexos?: Json | null
          ativo_id?: string | null
          categoria?: string
          codigo?: string
          data_atualizacao?: string
          data_criacao?: string
          descricao?: string
          id?: string
          offboarding?: Json | null
          onboarding?: Json | null
          prioridade?: string
          software_id?: string | null
          software_nome?: string | null
          solicitante_cargo?: string
          solicitante_email?: string
          solicitante_id?: string
          solicitante_nome?: string
          solicitante_setor_nome?: string
          status?: string
          tecnico_responsavel_id?: string | null
          tecnico_responsavel_nome?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "chamados_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamados_software_id_fkey"
            columns: ["software_id"]
            isOneToOne: false
            referencedRelation: "licencas_software"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamados_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chamados_tecnico_responsavel_id_fkey"
            columns: ["tecnico_responsavel_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          cargo: string
          created_at: string
          data_admissao: string
          email: string
          gestor_id: string | null
          id: string
          matricula: string
          nome: string
          role: string
          setor_id: string | null
          status: string
          telefone: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          cargo: string
          created_at?: string
          data_admissao: string
          email: string
          gestor_id?: string | null
          id: string
          matricula: string
          nome: string
          role?: string
          setor_id?: string | null
          status: string
          telefone?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          cargo?: string
          created_at?: string
          data_admissao?: string
          email?: string
          gestor_id?: string | null
          id?: string
          matricula?: string
          nome?: string
          role?: string
          setor_id?: string | null
          status?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_colaborador_gestor"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes_empresa: {
        Row: {
          logo_url: string | null
          sla: Json | null
          doc_devolucao: Json
          doc_entrega: Json
          campos_personalizados: Json | null
          cep: string
          cidade_uf: string
          cnpj: string
          email_ti: string
          endereco: string
          id: string
          nome_fantasia: string
          razao_social: string
          telefone_ti: string
          texto_termo_devolucao: string
          texto_termo_entrega: string
          updated_at: string
        }
        Insert: {
          logo_url?: string | null
          sla?: Json | null
          doc_devolucao?: Json
          doc_entrega?: Json
          campos_personalizados?: Json | null
          cep: string
          cidade_uf: string
          cnpj: string
          email_ti: string
          endereco: string
          id?: string
          nome_fantasia: string
          razao_social: string
          telefone_ti: string
          texto_termo_devolucao: string
          texto_termo_entrega: string
          updated_at?: string
        }
        Update: {
          logo_url?: string | null
          sla?: Json | null
          doc_devolucao?: Json
          doc_entrega?: Json
          campos_personalizados?: Json | null
          cep?: string
          cidade_uf?: string
          cnpj?: string
          email_ti?: string
          endereco?: string
          id?: string
          nome_fantasia?: string
          razao_social?: string
          telefone_ti?: string
          texto_termo_devolucao?: string
          texto_termo_entrega?: string
          updated_at?: string
        }
        Relationships: []
      }
      contrato_itens: {
        Row: {
          ativo_id: string | null
          contrato_id: string
          id: string
          licenca_id: string | null
        }
        Insert: {
          ativo_id?: string | null
          contrato_id: string
          id?: string
          licenca_id?: string | null
        }
        Update: {
          ativo_id?: string | null
          contrato_id?: string
          id?: string
          licenca_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_itens_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_itens_licenca_id_fkey"
            columns: ["licenca_id"]
            isOneToOne: false
            referencedRelation: "licencas_software"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          arquivo_caminho: string | null
          contato_suporte: string | null
          criado_em: string
          criado_por: string | null
          descricao: string
          fim: string | null
          fornecedor_id: string
          id: string
          inicio: string
          numero: string | null
          observacoes: string | null
          periodicidade: string
          sla: string | null
          tipo: string
          valor: number
        }
        Insert: {
          arquivo_caminho?: string | null
          contato_suporte?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao: string
          fim?: string | null
          fornecedor_id: string
          id?: string
          inicio: string
          numero?: string | null
          observacoes?: string | null
          periodicidade?: string
          sla?: string | null
          tipo: string
          valor?: number
        }
        Update: {
          arquivo_caminho?: string | null
          contato_suporte?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string
          fim?: string | null
          fornecedor_id?: string
          id?: string
          inicio?: string
          numero?: string | null
          observacoes?: string | null
          periodicidade?: string
          sla?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      departamentos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          responsavel_id: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id: string
          nome: string
          responsavel_id?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_id?: string | null
        }
        Relationships: []
      }
      faturas: {
        Row: {
          arquivo_caminho: string | null
          competencia: string
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          id: string
          licenca_id: string | null
          numero_documento: string | null
          observacoes: string | null
          pago_em: string | null
          status: string
          valor: number
          vencimento: string
        }
        Insert: {
          arquivo_caminho?: string | null
          competencia: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          licenca_id?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          valor: number
          vencimento: string
        }
        Update: {
          arquivo_caminho?: string | null
          competencia?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          id?: string
          licenca_id?: string | null
          numero_documento?: string | null
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_licenca_id_fkey"
            columns: ["licenca_id"]
            isOneToOne: false
            referencedRelation: "licencas_software"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cnpj: string | null
          contato: string | null
          criado_em: string
          criado_por: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          site: string | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          site?: string | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          contato?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          site?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_custodia: {
        Row: {
          ativo_id: string
          colaborador_id: string
          colaborador_nome: string
          created_at: string
          data_devolucao: string | null
          data_entrega: string
          id: string
          motivo_devolucao: string | null
          observacoes: string | null
          termo_id: string | null
        }
        Insert: {
          ativo_id: string
          colaborador_id: string
          colaborador_nome: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega: string
          id: string
          motivo_devolucao?: string | null
          observacoes?: string | null
          termo_id?: string | null
        }
        Update: {
          ativo_id?: string
          colaborador_id?: string
          colaborador_nome?: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega?: string
          id?: string
          motivo_devolucao?: string | null
          observacoes?: string | null
          termo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_custodia_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_custodia_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      licencas_segredos: {
        Row: {
          chave_contrato: string | null
          licenca_id: string
          updated_at: string
        }
        Insert: {
          chave_contrato?: string | null
          licenca_id: string
          updated_at?: string
        }
        Update: {
          chave_contrato?: string | null
          licenca_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licencas_segredos_licenca_id_fkey"
            columns: ["licenca_id"]
            isOneToOne: true
            referencedRelation: "licencas_software"
            referencedColumns: ["id"]
          },
        ]
      }
      licencas_software: {
        Row: {
          assentos_totais: number
          colaboradores_ids: Json | null
          created_at: string
          data_renovacao: string
          fornecedor: string
          fornecedor_id: string | null
          id: string
          nome: string
          observacoes: string | null
          tipo_cobranca: string | null
          url_painel: string | null
          valor_mensal: number
        }
        Insert: {
          assentos_totais?: number
          colaboradores_ids?: Json | null
          created_at?: string
          data_renovacao: string
          fornecedor: string
          fornecedor_id?: string | null
          id: string
          nome: string
          observacoes?: string | null
          tipo_cobranca?: string | null
          url_painel?: string | null
          valor_mensal?: number
        }
        Update: {
          assentos_totais?: number
          colaboradores_ids?: Json | null
          created_at?: string
          data_renovacao?: string
          fornecedor?: string
          fornecedor_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          tipo_cobranca?: string | null
          url_painel?: string | null
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "licencas_software_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencoes: {
        Row: {
          aberta_em: string
          ativo_id: string
          chamado_id: string | null
          coberto_garantia: boolean
          concluida_em: string | null
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          custo: number
          descricao: string
          encerrado_em: string | null
          encerrado_por: string | null
          fornecedor_id: string | null
          id: string
          numero_os: string | null
          observacoes: string | null
          previsao: string | null
          status: string
          tipo: string
        }
        Insert: {
          aberta_em?: string
          ativo_id: string
          chamado_id?: string | null
          coberto_garantia?: boolean
          concluida_em?: string | null
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          custo?: number
          descricao: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          fornecedor_id?: string | null
          id?: string
          numero_os?: string | null
          observacoes?: string | null
          previsao?: string | null
          status?: string
          tipo: string
        }
        Update: {
          aberta_em?: string
          ativo_id?: string
          chamado_id?: string | null
          coberto_garantia?: boolean
          concluida_em?: string | null
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          custo?: number
          descricao?: string
          encerrado_em?: string | null
          encerrado_por?: string | null
          fornecedor_id?: string | null
          id?: string
          numero_os?: string | null
          observacoes?: string | null
          previsao?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_chamado_id_fkey"
            columns: ["chamado_id"]
            isOneToOne: false
            referencedRelation: "chamados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_responsabilidade: {
        Row: {
          aceite_colaborador_em: string | null
          aceite_colaborador_uid: string | null
          aceite_ti_em: string | null
          aceite_ti_por: string | null
          chamado_id: string | null
          doc_codigo: string | null
          doc_referencia: string | null
          doc_titulo: string | null
          doc_versao: string | null
          forma_assinatura: string
          hash_conteudo: string | null
          itens: Json
          local_unidade: string | null
          motivo_dispensa: string | null
          observacoes: string | null
          texto_clausula: string | null
          arquivo_url: string | null
          ativo_ids: Json | null
          codigo: string
          colaborador_cargo: string
          colaborador_id: string
          colaborador_matricula: string
          colaborador_nome: string
          colaborador_setor_nome: string
          data_assinatura: string | null
          data_emissao: string
          id: string
          responsavel_ti_id: string
          responsavel_ti_nome: string
          status_assinatura: string
          tipo: string
        }
        Insert: {
          aceite_colaborador_em?: string | null
          aceite_colaborador_uid?: string | null
          aceite_ti_em?: string | null
          aceite_ti_por?: string | null
          chamado_id?: string | null
          doc_codigo?: string | null
          doc_referencia?: string | null
          doc_titulo?: string | null
          doc_versao?: string | null
          forma_assinatura?: string
          hash_conteudo?: string | null
          itens?: Json
          local_unidade?: string | null
          motivo_dispensa?: string | null
          observacoes?: string | null
          texto_clausula?: string | null
          arquivo_url?: string | null
          ativo_ids?: Json | null
          codigo: string
          colaborador_cargo: string
          colaborador_id: string
          colaborador_matricula: string
          colaborador_nome: string
          colaborador_setor_nome: string
          data_assinatura?: string | null
          data_emissao?: string
          id: string
          responsavel_ti_id: string
          responsavel_ti_nome: string
          status_assinatura: string
          tipo: string
        }
        Update: {
          aceite_colaborador_em?: string | null
          aceite_colaborador_uid?: string | null
          aceite_ti_em?: string | null
          aceite_ti_por?: string | null
          chamado_id?: string | null
          doc_codigo?: string | null
          doc_referencia?: string | null
          doc_titulo?: string | null
          doc_versao?: string | null
          forma_assinatura?: string
          hash_conteudo?: string | null
          itens?: Json
          local_unidade?: string | null
          motivo_dispensa?: string | null
          observacoes?: string | null
          texto_clausula?: string | null
          arquivo_url?: string | null
          ativo_ids?: Json | null
          codigo?: string
          colaborador_cargo?: string
          colaborador_id?: string
          colaborador_matricula?: string
          colaborador_nome?: string
          colaborador_setor_nome?: string
          data_assinatura?: string | null
          data_emissao?: string
          id?: string
          responsavel_ti_id?: string
          responsavel_ti_nome?: string
          status_assinatura?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_responsabilidade_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_itens: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          sugerido_onboarding: boolean
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          sugerido_onboarding?: boolean
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          sugerido_onboarding?: boolean
          tipo?: string
        }
        Relationships: []
      }
      colaborador_recursos: {
        Row: {
          catalogo_id: string | null
          chamado_concessao: string | null
          chamado_encerramento: string | null
          colaborador_id: string
          concedido_em: string
          concedido_por: string | null
          encerrado_em: string | null
          encerrado_por: string | null
          id: string
          identificador: string | null
          nome: string
          observacao: string | null
          status: string
          tipo: string
        }
        Insert: {
          catalogo_id?: string | null
          chamado_concessao?: string | null
          chamado_encerramento?: string | null
          colaborador_id: string
          concedido_em?: string
          concedido_por?: string | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          identificador?: string | null
          nome: string
          observacao?: string | null
          status?: string
          tipo: string
        }
        Update: {
          catalogo_id?: string | null
          chamado_concessao?: string | null
          chamado_encerramento?: string | null
          colaborador_id?: string
          concedido_em?: string
          concedido_por?: string | null
          encerrado_em?: string | null
          encerrado_por?: string | null
          id?: string
          identificador?: string | null
          nome?: string
          observacao?: string | null
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      lembretes: {
        Row: {
          ativo_id: string | null
          chamado_id: string | null
          colaborador_id: string | null
          concluido_em: string | null
          concluido_por: string | null
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          item_id: string | null
          observacao_conclusao: string | null
          status: string
          titulo: string
          vence_em: string
        }
        Insert: {
          ativo_id?: string | null
          chamado_id?: string | null
          colaborador_id?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          item_id?: string | null
          observacao_conclusao?: string | null
          status?: string
          titulo: string
          vence_em: string
        }
        Update: {
          ativo_id?: string | null
          chamado_id?: string | null
          colaborador_id?: string | null
          concluido_em?: string | null
          concluido_por?: string | null
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          item_id?: string | null
          observacao_conclusao?: string | null
          status?: string
          titulo?: string
          vence_em?: string
        }
        Relationships: []
      }
      processo_eventos: {
        Row: {
          acao: string
          chamado_id: string
          detalhe: Json | null
          em: string
          id: number
          item_id: string | null
          por: string | null
        }
        Insert: {
          acao: string
          chamado_id: string
          detalhe?: Json | null
          em?: string
          id?: number
          item_id?: string | null
          por?: string | null
        }
        Update: {
          acao?: string
          chamado_id?: string
          detalhe?: Json | null
          em?: string
          id?: number
          item_id?: string | null
          por?: string | null
        }
        Relationships: []
      }
      processo_itens: {
        Row: {
          ativo_id: string | null
          catalogo_id: string | null
          chamado_id: string
          concluido_em: string | null
          concluido_por: string | null
          condicao: string | null
          criado_em: string
          criado_por: string | null
          destino: string | null
          destino_colaborador_id: string | null
          detalhe: string | null
          id: string
          identificador: string | null
          lembrete_em: string | null
          licenca_id: string | null
          observacao: string | null
          ordem: number
          recurso_id: string | null
          status: string
          sugerido_por: string
          tipo: string
          titulo: string
        }
        Insert: {
          ativo_id?: string | null
          catalogo_id?: string | null
          chamado_id: string
          concluido_em?: string | null
          concluido_por?: string | null
          condicao?: string | null
          criado_em?: string
          criado_por?: string | null
          destino?: string | null
          destino_colaborador_id?: string | null
          detalhe?: string | null
          id?: string
          identificador?: string | null
          lembrete_em?: string | null
          licenca_id?: string | null
          observacao?: string | null
          ordem?: number
          recurso_id?: string | null
          status?: string
          sugerido_por?: string
          tipo: string
          titulo: string
        }
        Update: {
          ativo_id?: string | null
          catalogo_id?: string | null
          chamado_id?: string
          concluido_em?: string | null
          concluido_por?: string | null
          condicao?: string | null
          criado_em?: string
          criado_por?: string | null
          destino?: string | null
          destino_colaborador_id?: string | null
          detalhe?: string | null
          id?: string
          identificador?: string | null
          lembrete_em?: string | null
          licenca_id?: string | null
          observacao?: string | null
          ordem?: number
          recurso_id?: string | null
          status?: string
          sugerido_por?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolver_chamado: {
        Args: { p_causa: string; p_chamado: string; p_proximo_passo?: string; p_solucao: string; p_tempo_min?: number; p_tipo: string }
        Returns: undefined
      }
      cancelar_chamado: { Args: { p_chamado: string; p_detalhe?: string; p_motivo: string }; Returns: undefined }
      reabrir_chamado: { Args: { p_chamado: string; p_motivo: string }; Returns: undefined }
      avaliar_chamado: { Args: { p_chamado: string; p_comentario?: string; p_nota: number }; Returns: undefined }
      aceitar_termo: { Args: { p_termo: string }; Returns: Json }
      concluir_processo: { Args: { p_chamado: string }; Returns: Json }
      dispensar_assinatura_termo: {
        Args: { p_motivo: string; p_termo: string }
        Returns: undefined
      }
      registrar_item_processo: {
        Args: { p_dados?: Json; p_item: string; p_observacao?: string; p_status: string }
        Returns: Json
      }
      alocar_licenca: {
        Args: { p_colaborador: string; p_licenca: string }
        Returns: Json
      }
      anonimizar_colaborador: {
        Args: { p_colaborador: string }
        Returns: undefined
      }
      concluir_offboarding: { Args: { p_chamado: string }; Returns: Json }
      meu_colaborador_id: { Args: never; Returns: string }
      meu_papel: { Args: never; Returns: string }
      revogar_licenca: {
        Args: { p_colaborador: string; p_licenca: string }
        Returns: Json
      }
      abrir_manutencao: {
        Args: { p_ativo: string; p_dados: Json }
        Returns: string
      }
      baixar_ativo: { Args: { p_ativo: string; p_dados: Json }; Returns: string }
      encerrar_manutencao: {
        Args: { p_dados?: Json; p_manutencao: string; p_status: string }
        Returns: undefined
      }
      estornar_baixa: {
        Args: { p_baixa: string; p_motivo: string }
        Returns: undefined
      }
      salvar_contrato: {
        Args: { p_contrato: Json; p_itens?: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
