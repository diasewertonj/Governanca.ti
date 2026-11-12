# Nexus IT & HR — Governança de TI e Ativos

Sistema interno de gestão de ativos de TI, licenças de software, service desk e ciclo de vida do colaborador (admissão e desligamento), com termos de responsabilidade e trilha de auditoria.

- **Site:** React 19 + Vite + Tailwind, hospedado na Vercel
- **Banco, login e arquivos:** Supabase (Postgres com RLS, Auth e Storage privado)
- **Sem servidor próprio:** o navegador fala direto com o Supabase. Toda regra de acesso está **no banco** (RLS, triggers e funções); a interface só esconde o que o papel não usa.

## Papéis

| Papel | Vê | Faz |
|---|---|---|
| `colaborador` | os próprios dados, equipamentos, termos e chamados | abre chamados e responde neles |
| `rh` | colaboradores, ativos (sem BitLocker), termos, admissões e desligamentos | cadastra colaboradores e abre admissões/desligamentos |
| `ti_suporte` | tudo, inclusive notas internas e segredos | ativos, licenças, custódia, termos, chamados |
| `ti_admin` | tudo | também papéis, setores, configurações, anonimização (LGPD) |

Perfil desligado, login sem perfil cadastrado e visitante sem login não veem nada (o visitante vê só a razão social na tela de login).

## Rodar localmente

```bash
npm install
npm run dev
```

Sem o arquivo `.env.local`, o `npm run dev` abre em **modo demonstração** (dados fictícios só no navegador; login `admin.ti@nexuscorp.com.br` / `nexus@2026`). Para usar um Supabase, copie `.env.example` para `.env.local` e preencha. O build de produção não tem modo demonstração.

## Verificações

| Comando | O que faz |
|---|---|
| `npm run typecheck` | TypeScript em modo `strict` (tipos do banco em `src/types/database.types.ts`) |
| `npm run lint` | ESLint com regras de TypeScript e de hooks do React |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:db` | 75 cenários de banco num Postgres descartável (precisa do Docker) |
| `npm run check` | Tudo acima, menos o de banco, e o build |

O GitHub Actions (`.github/workflows/ci.yml`) roda todos eles, inclusive o de banco, em cada push e pull request.

## Banco de dados

Um banco novo é montado assim, nesta ordem:

1. `supabase-schema.sql`: linha de base histórica. **Sozinho, ele é inseguro.**
2. Todas as migrations de `supabase/migrations/`, em ordem de nome:

| Migration | O que faz |
|---|---|
| `20261111000000_fase0_guard_colaborador_role` | só `ti_admin` define papéis |
| `20261111000001_fase0_fechar_acesso_anon` | nada é acessível sem login |
| `20261112000000_fase1_identidade` | liga colaborador ao login (`auth_user_id`) e cria `meu_papel()` |
| `20261112000100_fase1_rls_por_papel` | RLS por papel; BitLocker e chave de contrato em tabelas só da TI |
| `20261113000000_fase2_integridade` | códigos gerados pelo banco, alocação atômica de licença, índices, histórico protegido contra exclusão |
| `20261114000000_fase3_processos` | Storage privado, desligamento automático, anonimização (LGPD) |
| `20261115000000_fase6_processos_guiados` | catálogo, checklist de on/offboarding com trilha de auditoria, inventário de contas/grupos/acessórios, lembretes, termo com aceite eletrônico |
| `20261116000000_fase7_logo_empresa` | coluna `logo_url` (só links https) para o logo da empresa |

Todas podem ser rodadas mais de uma vez.

### Edge Function `criar-acesso-nexus` (Fase 6)

Cria o login do colaborador com **senha provisória** (ou gera uma nova) sem depender de e-mail; no primeiro login a pessoa troca a senha. Só `ti_admin`/`ti_suporte` chamam; o e-mail vem do cadastro. A chave `service_role` fica só no servidor do Supabase (variável já fornecida pela plataforma). Opcional: `ORIGENS_PERMITIDAS` (lista separada por vírgula) para o CORS.

```bash
supabase functions deploy criar-acesso-nexus
```

## Processos guiados de admissão e desligamento (Fase 6)

- **RH** abre o chamado marcando o kit e as contas a partir do **catálogo** (Configurações › Catálogo de admissão); pode sugerir grupos de e-mail. Acompanha o andamento e conversa pelas mensagens.
- **T.I.** monta o checklist sugerido (rascunho, nada é obrigatório), registra cada passo — login criado, ativo entregue, licença, destino da conta, condição da devolução — e conclui. O banco valida e aplica os efeitos no inventário numa transação (`registrar_item_processo`, `concluir_processo`).
- **Desligamento**: o checklist nasce do inventário real da pessoa; dados do Drive e caixa de e-mail têm destino, descrição e lembrete.
- **Termo** no layout do documento controlado (RG.TI.001/002, código e versão em Configurações › Empresa). Assinatura híbrida: aceite eletrônico das duas partes (com código de verificação SHA-256), documento físico anexado ou dispensa com motivo. Termo pendente na conclusão vira lembrete. Para aplicar em produção, use o **SQL Editor** do Supabase: o conector MCP recusa comandos com `DROP` sem mostrar a confirmação.

Depois de mudar o banco, regenere os tipos (`supabase gen types typescript`) em `src/types/database.types.ts`.

## Configuração do Supabase (painel)

- **Authentication → URL Configuration:** *Site URL* e *Redirect URLs* com o domínio do site (links de convite e recuperação de senha).
- **Authentication → Sign In / Providers:** cadastro aberto **desligado**. Novos usuários são convidados em *Authentication → Users → Invite*, depois de cadastrados em Colaboradores.
- **Authentication → Attack Protection:** proteção contra senhas vazadas ligada.

## Navegação e telas (Fase 7)

- **Um nome por tela**, igual no menu e no título: `src/utils/navegacao.ts` é a fonte única dos títulos e do menu de cada perfil, e `vistaPermitida` libera só as telas do menu do perfil. Tela nova = incluir lá.
- **Celular e tablet** (abaixo de 1024px): o menu vira gaveta (botão ☰), janelas grandes abrem em tela cheia, listas principais viram cartões abaixo de 768px e barras de filtros quebram linha.
- **Padrão visual**: texto mínimo de 12px nas telas (o termo A4 segue o tamanho de impressão), cinza de texto com contraste AA, foco visível pelo teclado, área de toque de 40px em telas de toque.

## Regra de interface: nada grava sozinho

Toda edição fica pendente até a pessoa clicar em **Salvar alterações**, e **Cancelar** volta ao valor original. Para telas novas:

- Guarde a edição num estado de rascunho e mostre `<BarraAlteracoes itens={...} onCancelar onSalvar />` (`src/components/comum/BarraAlteracoes.tsx`).
- Registre as pendências com `useRegistrarPendencias(origem, itens)` (`src/hooks/usePendencias.ts`). Assim, trocar de tela, sair da conta ou fechar a aba pergunta antes de descartar.
- Ao fechar uma janela com pendências, use `confirmarDescarte(itens)`.
- Exclusões e ações que tiram acesso pedem confirmação dizendo o que vai acontecer.
- Arquivos só sobem para o Storage quando o formulário é enviado.

## Estrutura

```
src/
  context/AppContext.tsx      estado, ações e sessão (grava no banco e desfaz a tela se falhar)
  services/supabase.ts        cliente Supabase tipado e funções de login/senha
  services/supabaseDb.ts      leitura e gravação por tabela, Storage e RPCs
  components/                 telas por área (assets, servicedesk, rh, terms, settings, lgpd...)
  types/database.types.ts     gerado pelo Supabase, não editar à mão
supabase/
  migrations/                 mudanças do banco (fonte da verdade)
  tests/                      apoio (stubs de auth/storage e dados) e cenários por fase
scripts/test-db.mjs           roda os testes de banco
```
