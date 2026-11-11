# Fase 0 — Contenção (modo assistido)

Objetivo: parar a escalada de privilégio e reduzir quem consegue entrar, **sem** mudar a estrutura do banco. Tempo estimado: 30–45 min.
Você executa cada passo; depois me manda os resultados (prints ou CSV) para eu avaliar o próximo.

> Esta fase **não** resolve tudo. As policies `using (true)` continuam. Qualquer usuário logado ainda lê e grava as demais tabelas pela API. Isso é a Fase 1.

---

## Passo 1 — Backup antes de qualquer coisa
Painel Supabase → **Database → Backups**.
- Plano Pro ou superior: confirme que existe um backup de hoje.
- Plano Free: não há backup automático. Me avise que eu preparo um export (tabela a tabela em CSV pelo Table Editor, ou `pg_dump` pela string de conexão rodado por você).

## Passo 2 — Diagnóstico (somente leitura)
Painel → **SQL Editor** → cole `supabase/diagnostics/fase0_diagnostico.sql`.
Rode **um bloco por vez** e guarde o resultado. O que procurar:

| Bloco | Sinal de problema |
|---|---|
| 1 e 2 | `ti_admin` que você não nomeou, principalmente com cargo "Administrador de T.I. & Governança" e id `emp-xxxxxxxx` (bug CRIT-02) |
| 3 | Contas de Auth que você não reconhece (ex.: Gmail de terceiros com provedor `google`) |
| 5 e 6 | RLS desligado em alguma tabela, ou policies diferentes de `using (true)` (o banco pode estar diferente do arquivo) |
| 7 | Se aparecer `urgente`/`aguardando_peca` no CHECK, o banco difere do arquivo (aí o CRIT-03 não ocorre) |
| 8 | Triggers ou funções que não estão no repositório |

## Passo 3 — Corrigir papéis indevidos (você decide quais)
Só depois de analisar o Passo 2. Troque os e-mails pelos que devem perder o acesso de gestão:

```sql
-- 3a. Confira exatamente quem será alterado
select id, email, role from public.colaboradores
where lower(email) in ('pessoa1@exemplo.com', 'pessoa2@exemplo.com');

-- 3b. Rebaixe (devolve as linhas alteradas)
update public.colaboradores
set role = 'colaborador'
where lower(email) in ('pessoa1@exemplo.com', 'pessoa2@exemplo.com')
returning id, email, role;
```

Contas de Auth desconhecidas: **Authentication → Users** → ⋯ → *Ban user* (reversível) em vez de *Delete*.

## Passo 4 — Trigger de proteção de papéis
**SQL Editor** → cole e rode `supabase/migrations/20261111000000_fase0_guard_colaborador_role.sql`.
Depois rode a conferência (deve devolver 1 linha):

```sql
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.colaboradores'::regclass and not tgisinternal;
```

Testado localmente (Postgres 16 com o `auth` do Supabase simulado): 12/12 cenários passaram.
- **Bloqueia:** colaborador se promovendo; o upsert do bug de login criando ou sobrescrevendo `ti_admin`; `ti_suporte` trocando papel; admin desligado trocando papel.
- **Permite:** `ti_admin` ativo trocando papel; SQL Editor; service_role; alterar campos que não são o papel.

Efeito colateral: usuário **novo** não ganha mais perfil automaticamente no primeiro login (antes ganhava como `ti_admin`). Cadastre a pessoa em **Colaboradores** (logado como `ti_admin`) com o mesmo e-mail antes do primeiro acesso.

Rollback: as duas linhas comentadas no fim do arquivo.

## Passo 5 — Configuração do Auth (painel)
| Onde | Ajuste |
|---|---|
| Authentication → Sign In / Providers → *Allow new users to sign up* | **Desligar**. Bloqueia contas novas por e-mail **e** por Google. Usuários passam a ser convidados por *Authentication → Users → Invite* |
| Authentication → Sign In / Providers → Email → *Confirm email* | Ligado |
| Authentication → Sign In / Providers → Google | Se não usa, desligue. Se usa e tem Google Workspace, no Google Cloud deixe a tela de consentimento como **Internal** (só contas da empresa) |
| Authentication → URL Configuration | *Site URL* = domínio de produção; *Redirect URLs* só produção + `http://localhost:3000` |

## Passo 6 — Patch de interface (branch `security/fase0-contencao`)
- Configurações visível e acessível só para `ti_admin` (antes `ti_suporte` também entrava): `src/App.tsx`, `src/components/layout/Sidebar.tsx`.
- "Zerar dados" e "Restaurar base de demonstração" ocultos quando o Supabase está conectado: `src/components/settings/SettingsView.tsx`.

É proteção só de interface; quem tem o token ainda chama a API. Revise o diff, faça o merge na `main` e a Vercel publica.

## Como validar depois (sem escrever no banco pela API)
1. Logue como `ti_suporte`: o menu Configurações não aparece.
2. Logue como `ti_admin` → Configurações → Banco: os botões de reset não aparecem.
3. Como `ti_admin`, troque o papel de um colaborador fictício e dê F5: a troca persiste.
4. Rode de novo os blocos 1 e 2 do diagnóstico: nenhum `ti_admin` novo.
