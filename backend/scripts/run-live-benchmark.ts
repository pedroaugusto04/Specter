import 'dotenv/config';
import * as cheerio from 'cheerio';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import { createConfigurationModel } from '../src/extraction/configurationModel.js';
import { createCompilerProvider } from '../src/providers/compilers/compiler.factory.js';
import { ExtractionExecutor } from '../src/extraction/executor.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { executionPolicy } from '../src/extraction/policy.js';
import { BrowserDocumentAdapter } from '../src/extraction/adapters/browserDocument.adapter.js';
import { BrowserCapacity } from '../src/resources/browserCapacity.js';
import type { ILeaseStore, ResourceLease } from '../src/resources/lease.js';
import type { DocumentAdapter, DocumentSnapshot } from '../src/extraction/contracts.js';

class SimpleLeaseStore implements ILeaseStore {
  readonly held = new Map<string, AbortController>();
  async tryAcquire(key: string): Promise<ResourceLease | null> {
    if (this.held.has(key)) return null;
    const controller = new AbortController();
    this.held.set(key, controller);
    return {
      signal: controller.signal,
      assertOwned: async () => {},
      release: async () => {
        this.held.delete(key);
      },
    };
  }
}

export interface LiveBenchmarkTest {
  id: string;
  name: string;
  category: 'SPA_JAVASCRIPT' | 'HEAVY_TABLE' | 'MULTI_FIELD_CATALOG' | 'TECHNICAL_FEED' | 'ECOMMERCE_MICRODATA';
  url: string;
  prompt: string;
  transport: 'http' | 'browser';
  description: string;
  expectedFields: string[];
}

export const liveBenchmarkSuite: LiveBenchmarkTest[] = [
  // 1. SPA com JavaScript dinâmico puro (Playwright Chromium Real)
  {
    id: 'quotes-js',
    name: '1. Quotes to Scrape JS (SPA Client-Side Render)',
    category: 'SPA_JAVASCRIPT',
    transport: 'browser',
    url: 'https://quotes.toscrape.com/js/',
    prompt: 'Extraia todas as frases com o texto da citação e o nome do autor',
    description: 'Página SPA onde o conteúdo não existe no HTML inicial e é renderizado 100% via JavaScript dinâmico. Testa o adapter headless Playwright e hidratação do DOM.',
    expectedFields: ['text', 'author'],
  },

  // 2. Catálogo multi-campo com moeda e condição de estoque
  {
    id: 'books-travel',
    name: '2. Books to Scrape (Catálogo Multi-Campo & Estoque)',
    category: 'MULTI_FIELD_CATALOG',
    transport: 'http',
    url: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
    prompt: 'Extraia os livros com o título da obra, o preço em libras e a disponibilidade em estoque',
    description: 'Catálogo de e-commerce tradicional com moeda estrangeira (£), espaços em branco em tags de estoque e múltiplos cards de produto por página.',
    expectedFields: ['title', 'price', 'availability'],
  },

  // 3. Feed de lançamentos com DOM moderno do GitHub
  {
    id: 'github-releases',
    name: '3. GitHub Releases Next.js (Changelog / Feed Técnico)',
    category: 'TECHNICAL_FEED',
    transport: 'http',
    url: 'https://github.com/vercel/next.js/releases',
    prompt: 'Extraia as versões lançadas com a tag da versão e o link correspondente da release',
    description: 'DOM técnico altamente aninhado do GitHub, repleto de SVGs, tags semânticas, botões dinâmicos e links relativos.',
    expectedFields: ['tag', 'link'],
  },

  // 4. E-commerce brasileiro com Microdados / JSON-LD
  {
    id: 'consul',
    name: '4. Consul Brasil (E-Commerce com Microdados & JSON-LD)',
    category: 'ECOMMERCE_MICRODATA',
    transport: 'http',
    url: 'https://www.consul.com.br/geladeira-frost-free-duplex-consul-crm44mb/p',
    prompt: 'Extraia o nome da geladeira e o preço em reais',
    description: 'Página de produto moderna com metadados estruturados schema.org / JSON-LD e precificação em moeda nacional (BRL).',
    expectedFields: ['name', 'price'],
  },

  // 5. Agregador clássico em estrutura de tabela
  {
    id: 'hackernews',
    name: '5. Hacker News (Agregador em Tabela Aninhada)',
    category: 'TECHNICAL_FEED',
    transport: 'http',
    url: 'https://news.ycombinator.com/news',
    prompt: 'Extraia os posts com título e link para a notícia',
    description: 'Agregador de notícias tradicional organizado em linhas HTML com links externos e pontuações.',
    expectedFields: ['title', 'link'],
  },
];

async function fetchLiveDocument(url: string): Promise<DocumentSnapshot> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!resp.ok) {
    throw new Error(`Falha ao buscar URL ${url}: HTTP ${resp.status} ${resp.statusText}`);
  }

  const html = await resp.text();
  return {
    transport: 'http',
    html,
    url: resp.url || url,
    httpStatus: resp.status,
    responses: [],
  };
}

function createHttpAdapter(snapshot: DocumentSnapshot): DocumentAdapter {
  return {
    async open() {
      return {
        capabilities: { interactions: true, networkResponses: true, scopedDocuments: true },
        snapshot: async () => structuredClone(snapshot),
        check: async () => undefined,
        advance: async () => {},
        discover: async (action) => {
          if (action.kind === 'inspect') {
            const $ = cheerio.load(snapshot.html);
            const inspectedHtml = $(action.selector)
              .map((_, el) => $.html(el))
              .get()
              .join('\n');
            return { ...snapshot, html: inspectedHtml || snapshot.html };
          }
          return structuredClone(snapshot);
        },
        screenshot: async () => undefined,
        close: async () => {},
      };
    },
  };
}

export async function runLiveBenchmark(filterId?: string) {
  console.log('========================================================================');
  console.log('   STRESS TEST DO PIPELINE DE EXTRAÇÃO EM SITES REAIS DA WEB');
  console.log('========================================================================');
  console.log(`Provider: ${process.env.COMPILER_PROVIDER ?? 'api'}`);
  console.log(`Model:    ${process.env.COMPILER_API_MODEL ?? 'gemini-3.5-flash-lite'}`);
  console.log('------------------------------------------------------------------------\n');

  let passedTotal = 0;
  let failedTotal = 0;
  const benchmarkResults: Array<{
    id: string;
    name: string;
    category: string;
    transport: string;
    passed: boolean;
    durationMs: number;
    recordsCount: number;
    score: number | null;
    error?: string;
  }> = [];

  const policy = executionPolicy();
  const leaseStore = new SimpleLeaseStore();
  const browserCapacity = new BrowserCapacity(leaseStore, 2);
  const browserAdapter = new BrowserDocumentAdapter(policy, browserCapacity);

  for (const site of liveBenchmarkSuite) {
    if (filterId && site.id !== filterId) continue;

    console.log(`▶ [${site.id.toUpperCase()}] ${site.name}`);
    console.log(`  Categoria:  ${site.category}`);
    console.log(`  Transport:  ${site.transport.toUpperCase()}`);
    console.log(`  URL:        ${site.url}`);
    console.log(`  Prompt:     "${site.prompt}"`);
    console.log(`  Desafio:    ${site.description}`);

    const start = Date.now();
    try {
      let activeAdapter: DocumentAdapter;

      if (site.transport === 'browser') {
        console.log('  1. Usando BrowserDocumentAdapter (Playwright Chromium Real)...');
        activeAdapter = browserAdapter;
      } else {
        console.log('  1. Fazendo fetch HTTP ao vivo...');
        const fetchStart = Date.now();
        const snapshot = await fetchLiveDocument(site.url);
        console.log(
          `     HTML recebido: ${(snapshot.html.length / 1024).toFixed(1)} KB em ${Date.now() - fetchStart}ms`
        );
        activeAdapter = createHttpAdapter(snapshot);
      }

      console.log('  2. Executando ConfigurationPipeline (Investigação + Decisão + Validação + Review)...');
      const modelProvider = createCompilerProvider();
      const stages = createConfigurationModel(modelProvider);
      const executor = new ExtractionExecutor(
        { http: activeAdapter, browser: browserAdapter },
        new PageExtractor(standardSourceReaders()),
        policy
      );

      const pipeline = new ConfigurationPipeline(stages, activeAdapter, executor, {
        budgetMs: 120000,
        maxAttempts: 3,
        maxDecisions: 10,
        reviewReserveMs: 5000,
        evidenceLimit: 30000,
        semanticEnabled: true,
        semanticThreshold: 4,
      });

      const res = await pipeline.configure({
        jobId: `stress-${site.id}`,
        url: site.url,
        prompt: site.prompt,
      });

      const totalDuration = Date.now() - start;
      const data = res.execution.data as Record<string, unknown>;
      const count =
        (data as { count?: number }).count ??
        ((data as { items?: unknown[] }).items?.length ?? 1);

      console.log(`  ✔ [PASS] Concluído em ${totalDuration}ms`);
      console.log(`    Modo:      ${res.plan.intent.mode} (Registros extraídos: ${count})`);
      console.log(`    Transport: ${res.plan.strategy.transport}`);
      console.log(`    Seletores: ${JSON.stringify(res.plan.strategy.fields)}`);
      console.log(`    Review:    Nota ${res.semanticReview.score}/10 (${res.semanticReview.status})`);

      if (res.plan.intent.mode === 'collection') {
        const items = (data as { items?: unknown[] }).items ?? [];
        console.log(`    Amostra dos 2 primeiros registros:`);
        console.log(`    ${JSON.stringify(items.slice(0, 2), null, 4).replace(/\n/g, '\n    ')}`);
      } else {
        console.log(`    Registro extraído: ${JSON.stringify(data)}`);
      }
      console.log();

      passedTotal++;
      benchmarkResults.push({
        id: site.id,
        name: site.name,
        category: site.category,
        transport: site.transport,
        passed: true,
        durationMs: totalDuration,
        recordsCount: count,
        score: res.semanticReview.score,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ✖ [FAIL] Falha no teste: ${errorMsg}`);
      console.log();
      failedTotal++;
      benchmarkResults.push({
        id: site.id,
        name: site.name,
        category: site.category,
        transport: site.transport,
        passed: false,
        durationMs: Date.now() - start,
        recordsCount: 0,
        score: null,
        error: errorMsg,
      });
    }

    // Intervalo de segurança preventivo contra rate limit da API
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('========================================================================');
  console.log(`TABELA RESUMO DOS TESTES DE STRESS (SITES REAIS)`);
  console.log('========================================================================');
  for (const b of benchmarkResults) {
    const status = b.passed ? '✔ PASS' : '✖ FAIL';
    const scoreStr = b.score !== null ? String(b.score).padStart(2) : '--';
    console.log(
      `${status.padEnd(8)} | [${b.id.padEnd(15)}] | Score: ${scoreStr}/10 | Records: ${String(b.recordsCount).padStart(3)} | ${String(b.durationMs).padStart(6)}ms | ${b.name}`
    );
    if (!b.passed && b.error) {
      console.log(`         ↳ Erro: ${b.error.slice(0, 140)}...`);
    }
  }
  console.log('------------------------------------------------------------------------');
  console.log(`TOTAL: ${passedTotal} PASSARAM | ${failedTotal} FALHARAM`);
  console.log('========================================================================');

  if (failedTotal > 0) process.exitCode = 1;
}

const arg = process.argv.find((a) => a.startsWith('--site='));
const siteId = arg ? arg.split('=')[1] : undefined;

runLiveBenchmark(siteId).catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
