# Specter — Scraper & Monitor Autônomo com IA

Plataforma autônoma de extração e monitoramento web que combina **configuração adaptativa com ferramentas tipadas via IA** (`IModelProvider`: AGY CLI / Codex / API) com **execução determinística contínua** (BullMQ + Playwright + Cheerio + Fastify + Drizzle ORM + Next.js), operando com **0 consumo de tokens de LLM** nas checagens rotineiras e **Auto-Cura (_Self-Healing_)** em caso de alterações de layout.

---

## Arquitetura do Projeto

- **`backend/`**: API Fastify (Node.js 20+ ESM, TypeScript), Drizzle ORM (PostgreSQL 16+), filas BullMQ (Redis 7+), provedores plugáveis (`ICompilerProvider`, `IScraperEngine`, `INotificationProvider`) e suíte de testes comportamentais (Vitest).
- **`frontend/`**: Dashboard reativo em Next.js (App Router), Tailwind CSS e componentes baseados em shadcn/ui.
- **`docker-compose.yml`**: Infraestrutura local com PostgreSQL 16 e Redis 7.

---

## How to Run with Docker (Development vs Production)

### 1. Development Mode (with Live Hot-Reloading)

In development mode, your local code is mounted directly into the containers with file-system watchers enabled:

- **Backend**: Uses `tsx watch src/server.ts` to automatically restart on any TypeScript change.
- **Frontend**: Uses Next.js Fast Refresh with `WATCHPACK_POLLING=true` for instant UI updates.

```bash
docker compose -f docker-compose.dev.yml up --build
```

Or simply using the root npm script:

```bash
npm run dev
```

### 2. Production Mode (Standalone Optimized Builds)

```bash
docker compose up -d --build
```

---

### 1. Subir Banco de Dados e Redis

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d
```

### 2. Backend (Fastify + BullMQ + Drizzle)

```bash
cd backend
npm install
npm run db:migrate
npm run dev
```

### 3. Frontend (Next.js Dashboard)

```bash
cd frontend
npm install
npm run dev
```

Acesse o painel em `http://localhost:3000`.

---

## Testes e Validação

```bash
cd backend
npm test
npm run typecheck
npm run build
```

## Política de aquisição e bloqueios

A aquisição usa uma política sequencial compartilhada (`src/acquisition/runner.ts`)
para sondagem, descoberta e execução validada. O executor coordenado recebe os
adapters na composição e valida cada alternativa com o executor determinístico.
O adapter de sondagem utiliza a mesma política, sem um segundo mecanismo de retry.
Requisitos de browser e capacidades das sessões ficam em `extraction/capabilities.ts`.

HTTP começa localmente. Providers habilitados são usados após falha de acesso;
falhas locais de seletor não consomem cota externa. Respostas de providers só são
aceitas após validação. HTML passivo não substitui interação, iframe, Shadow DOM
ou respostas de rede exigidas pelo plano. Sondagem confirma acesso, não extração.
Sessões autenticadas não são encaminhadas aos providers externos.

Cada coleta compartilha o deadline `EXTRACTION_TIMEOUT_MS`, com navegações limitadas
por `PLAYWRIGHT_TIMEOUT_MS`. Falhas de aquisição já tratadas pelo coordenador não
reexecutam todo o orçamento via BullMQ; falhas de infraestrutura anteriores à
coleta continuam sujeitas ao retry da fila.

As configurações abaixo aceitam inteiros positivos e são validadas no startup:

| Variável                        | Default | Efeito                                               |
| ------------------------------- | ------- | ---------------------------------------------------- |
| `ACQUISITION_MAX_ATTEMPTS`      | `3`     | Alternativas por coleta, incluindo a local           |
| `ACCESS_BLOCK_THRESHOLD`        | `2`     | Execuções consecutivas bloqueadas antes da suspensão |
| `ACCESS_BLOCK_COOLDOWN_MINUTES` | `60`    | Duração da suspensão por monitor                     |

Configure-as no `.env` em desenvolvimento e em **GitHub Actions Variables** no
deploy automatizado. O workflow repassa os valores ao gerador de `backend.env`,
copiado para `.env.prod` e carregado pelo container. No deploy manual, forneça
`backend.env` ou edite `.env.prod` existente; sem esses arquivos, o script gera o
ambiente e o backend aplica os defaults. O deploy manual preserva um `.env.prod`
existente, portanto alterar apenas `.env` não substitui seus valores.

O cooldown usa Redis com atualizações atômicas e expiração. Continua válido entre
workers e ignora coletas manuais e agendadas sem alterar baseline, cron ou status.
URL, revisão do plano e atualização da sessão delimitam a suspensão; mudar qualquer
uma dessas referências inicia uma política de acesso nova. A contagem anterior à
suspensão permanece por tempo suficiente para os próximos agendamentos do monitor.
Se o controle de acesso estiver indisponível, a coleta não começa. Perda dos dados
do Redis perde também o cooldown, sem alterar a baseline em PostgreSQL.

O dashboard apresenta o prazo de retomada; logs e traces registram alternativas,
classificação e duração. Diagnósticos públicos passam por um apresentador comum,
inclusive no histórico, e os logs aplicam redação de credenciais.

`npm run --prefix backend evaluate:extraction` avalia 12 casos controlados com os
componentes reais de comparação e construção de alertas. Os cenários de aquisição,
cooldown, browser e persistência estão na suíte Vitest. Esse corpus não demonstra
cobertura geral da web: a próxima ampliação deve incorporar capturas autorizadas,
anonimizadas e com expectativas revisadas, registrando sua origem e autorização.

O schema do plano valida o escopo: planos de página não aceitam paginação. Falhas de campos obrigatórios incluem a fonte e uma amostra redigida do
valor observado no feedback; repetir uma estratégia rejeitada sem alterações encerra
a compilação atual. O configurador possui orçamento único de decisões e candidatos; retries transitórios da API e da fila continuam limitados.
As regras comuns de segurança ficam nos adaptadores. A revisão semântica habilitada deve concluir antes de ativar um plano. A API recebe o schema apenas
no contrato de saída estruturada; os adaptadores CLI o acrescentam ao prompt.
O Gemini usa seus parâmetros padrão de amostragem, sem temperatura fixa.

`npm run --prefix backend test -- tests/compilationReliability.test.ts` reproduz
falhas de fontes JSON-LD, placeholders de cotações, valores localizados, bloqueio
HTTP, correção por feedback e incompatibilidade de escopo. As fixtures são
reproduções sintéticas reduzidas dos sintomas observados em produção em 06/11/2026,
sem capturas completas, credenciais, chamadas a modelos ou acesso aos sites.

### Capacidade de browser e webhooks

O lock de monitor impede execuções concorrentes sobre o mesmo monitor. A capacidade
é reservada separadamente pelo `BrowserDocumentAdapter`, apenas enquanto houver
uma sessão Chromium em abertura ou uso. Sondagem pela API e workers compartilham
os mesmos slots Redis definidos por `SCRAPER_CONCURRENCY`. Etapas de IA e coletas
HTTP não ocupam slots de browser. Capacidade esgotada não inicia um browser;
perda da reserva cancela a sessão. Encerramento e liberação são idempotentes.

Webhooks de alerta e de teste utilizam o mesmo envio assinado e não seguem
redirects. Um endpoint que responde 3xx deve ser substituído pelo endereço final
HTTPS cadastrado. Isso evita encaminhar payloads e assinaturas para destinos que
não passaram pela validação inicial de URL.

### Chave de criptografia

`ENCRYPTION_KEY` é obrigatória em todos os ambientes: 64 caracteres hexadecimais
(32 bytes), gerados com `openssl rand -hex 32`. Configure-a no ambiente local e
em GitHub Actions Secrets. O deploy a encaminha ao container. Não use o segredo
JWT como chave de criptografia.

Somente o formato criptografado atual é aceito. Sessões e integrações locais
criadas com representações antigas devem ser recriadas. A chave deve permanecer
estável entre reinícios; perder ou substituir a chave torna esses dados ilegíveis.

## Contratos HTTP e fronteiras de dados

`packages/contracts` é um pacote ESM independente, sem banco, serviços, configuração
ou SDKs. Backend e frontend dependem dele via `file:../packages/contracts`; não
importam a implementação um do outro. Os DTOs e modelos públicos estão em arquivos
de declaração e o vocabulário de domínio tem uma única implementação JavaScript.
Após alterar `vocabulary.js`, regenere suas declarações a partir de um consumidor
com TypeScript instalado: `cd backend && node ../packages/contracts/generate-types.mjs`.
As declarações geradas devem acompanhar a mudança no repositório.

Os serviços retornam projeções explícitas. A apresentação de monitores resolve
cooldown e política semântica fora dos mappers puros. Sessões HTTP contêm somente
metadados; hashes de senha, cookies, tokens de integração e chaves de fila não fazem
parte dos DTOs. O segredo de webhook é somente de escrita: a leitura retorna
`hasWebhookSecret`. Omitir o segredo preserva o valor salvo; enviar `null` remove-o.
O frontend oferece essas operações sem receber o segredo existente.

A preparação comum de snapshots, comparação com baseline e alertas fica em
`SuccessfulRunService`. Compilação, coleta e healing mantêm suas próprias decisões
de ciclo de vida e persistem snapshots e entregas na transação existente.

Os builds Docker usam o contexto da raiz, copiando apenas o projeto correspondente
e o pacote de contratos. Mudanças nesse pacote disparam a validação dos dois
consumidores no workflow. O endpoint SSE exige autenticação e não possui usuário
padrão compartilhado. O histórico de migrações permanece necessário para reconstruir
o schema; compatibilidades de leitura de dados antigos foram removidas do runtime.

O fluxo atual de configuração, ferramentas, limites e evals está descrito em [docs/extraction-engine.md](docs/extraction-engine.md).
