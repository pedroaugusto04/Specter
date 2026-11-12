import 'dotenv/config';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import { createConfigurationModel } from '../src/extraction/configurationModel.js';
import { createCompilerProvider } from '../src/providers/compilers/compiler.factory.js';
import { composeExtraction } from '../src/extraction/composition.js';
import { createHttpCandidates } from '../src/providers/scraping/scraper.factory.js';
import { BrowserCapacity } from '../src/resources/browserCapacity.js';
import type { ILeaseStore, ResourceLease } from '../src/resources/lease.js';

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
  category:
    | 'SPA_JAVASCRIPT'
    | 'HEAVY_TABLE'
    | 'MULTI_FIELD_CATALOG'
    | 'TECHNICAL_FEED'
    | 'ECOMMERCE_MICRODATA'
    | 'NEWS_PORTAL';
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

  // 6. E-commerce nacional de varejo e tecnologia com precificação em BRL
  {
    id: 'kabum',
    name: '6. KaBuM! (E-commerce Brasileiro Real)',
    category: 'ECOMMERCE_MICRODATA',
    transport: 'http',
    url: 'https://www.kabum.com.br/produto/475438/placa-de-video-rx-6600-v2-asus-dual-amd-radeon-8gb-gddr6-dual-rx6600-8g-v2',
    prompt: 'Extraia o nome do produto e o preço à vista em reais',
    description: 'Página de grande e-commerce brasileiro com precificação em reais (BRL), parcelamentos e tags dinâmicas de varejo.',
    expectedFields: ['name', 'price'],
  },

  // 7. Portal de notícias de grande circulação com manchetes editoriais ao vivo
  {
    id: 'g1',
    name: '7. G1 Globo (Portal de Notícias Real)',
    category: 'NEWS_PORTAL',
    transport: 'http',
    url: 'https://g1.globo.com',
    prompt: 'Extraia as principais notícias com título da matéria e link',
    description: 'Portal de notícias brasileiro de alto tráfego com manchetes, links e blocos editoriais ao vivo.',
    expectedFields: ['title', 'link'],
  },

  // 8. Coleção HTML estático tradicional como baseline de comparação
  {
    id: 'quotes',
    name: '8. Quotes to Scrape (Catálogo Estático Baseline)',
    category: 'MULTI_FIELD_CATALOG',
    transport: 'http',
    url: 'https://quotes.toscrape.com',
    prompt: 'Extraia todas as frases com o texto da citação e o nome do autor',
    description: 'Página tradicional renderizada no servidor para teste baseline de extração de coleção sem execução de JavaScript.',
    expectedFields: ['text', 'author'],
  },

  // 9. Mercado Livre Brasil (Catálogo de Marketplace com Preços BRL e Selos)
  {
    id: 'mercadolivre',
    name: '9. Mercado Livre (Marketplace Brasileiro Real)',
    category: 'ECOMMERCE_MICRODATA',
    transport: 'http',
    url: 'https://lista.mercadolivre.com.br/monitor-gamer',
    prompt: 'Extraia os monitores com o nome do produto e o preço em reais',
    description: 'Marketplace de altíssimo volume com precificação em Reais (BRL), centavos separados, parcelamentos e selos de frete.',
    expectedFields: ['title', 'price'],
  },

  // 10. Reddit Tecnologia (Fórum / Mídia Social com Upvotes e Discussões)
  {
    id: 'reddit-tech',
    name: '10. Reddit Technology (Fórum / Rede Social)',
    category: 'TECHNICAL_FEED',
    transport: 'http',
    url: 'https://old.reddit.com/r/technology/',
    prompt: 'Extraia os posts com o título da publicação e o número de votos',
    description: 'Agregador de comunidade com pontuações numéricas, links de submissões e metadados de fórum.',
    expectedFields: ['title', 'votes'],
  },

  // 11. CoinMarketCap (Criptomoedas / Tabela Financeira Global)
  {
    id: 'coinmarketcap',
    name: '11. CoinMarketCap (Criptomoedas e Finanças)',
    category: 'HEAVY_TABLE',
    transport: 'http',
    url: 'https://coinmarketcap.com/',
    prompt: 'Extraia as criptomoedas com o nome da moeda e o preço atual em dólares',
    description: 'Tabela financeira densa com dezenas de colunas, formatação de moeda em USD e variações numéricas.',
    expectedFields: ['name', 'price'],
  },

  // 12. Wikipedia PIB Nominal (Tabela Complexa com Colspan/Rowspan de Dados Públicos)
  {
    id: 'wikipedia-gdp',
    name: '12. Wikipedia GDP (Dados Públicos em Tabela Complexa)',
    category: 'HEAVY_TABLE',
    transport: 'http',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_by_GDP_(nominal)',
    prompt: 'Extraia os países e o valor do PIB nominal',
    description: 'Tabela de dados estatísticos complexa da Wikipedia (wikitable sortable) com múltiplos cabeçalhos e notas.',
    expectedFields: ['country', 'gdp'],
  },

  // 13. RemoteOK (Job Board / Vagas de Emprego Remotas)
  {
    id: 'remoteok',
    name: '13. Remote OK (Job Board de Emprego Remoto)',
    category: 'MULTI_FIELD_CATALOG',
    transport: 'http',
    url: 'https://remoteok.com/',
    prompt: 'Extraia as vagas de trabalho remoto com o cargo e o nome da empresa',
    description: 'Plataforma de contratação remota global com cards de empresas, tags e cargos de tecnologia.',
    expectedFields: ['role', 'company'],
  },

  // 14. BBC News (Portal Internacional de Notícias)
  {
    id: 'bbc-news',
    name: '14. BBC News (Portal de Notícias Global)',
    category: 'NEWS_PORTAL',
    transport: 'http',
    url: 'https://www.bbc.com/news',
    prompt: 'Extraia as principais notícias com a manchete e o link da reportagem',
    description: 'Portal jornalístico britânico de escala global com manchetes responsivas e links editoriais.',
    expectedFields: ['headline', 'link'],
  },
];

export async function runLiveBenchmark(filterId?: string) {
  console.log('========================================================================');
  console.log('   STRESS TEST DO PIPELINE DE EXTRAÇÃO EM SITES REAIS DA WEB');
  console.log('========================================================================');
  console.log(`Provider: ${process.env.COMPILER_PROVIDER ?? 'api'}`);
  console.log(`Model:    ${process.env.COMPILER_API_MODEL ?? 'gemini-3.5-flash-lite'}`);
  console.log('Architecture: 100% Production Extraction Stack (composeExtraction + discovery + unblockers)');
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

  const leaseStore = new SimpleLeaseStore();
  const browserCapacity = new BrowserCapacity(leaseStore, 2);
  const candidates = createHttpCandidates();
  const extraction = composeExtraction(candidates, browserCapacity);
  const modelProvider = createCompilerProvider();
  const stages = createConfigurationModel(modelProvider);

  const pipeline = new ConfigurationPipeline(
    stages,
    extraction.discovery,
    extraction.executor,
    {
      budgetMs: 120000,
      maxAttempts: 3,
      maxDecisions: 10,
      reviewReserveMs: 5000,
      evidenceLimit: 30000,
      semanticEnabled: true,
      semanticThreshold: 4,
    }
  );

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
      console.log('  1. Executando ConfigurationPipeline (Investigação Discovery + Decisão + Validação + Review)...');

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
