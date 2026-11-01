# Dynamic-Scrapper — Scraper & Monitor Autônomo com IA

Plataforma autônoma de extração e monitoramento web que combina **geração pontual de seletores via IA** (`ICompilerProvider`: AGY CLI / Codex) com **execução determinística contínua** (BullMQ + Playwright + Cheerio + Fastify + Drizzle ORM + Next.js), operando com **0 consumo de tokens de LLM** nas checagens rotineiras e **Auto-Cura (*Self-Healing*)** em caso de alterações de layout.

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
