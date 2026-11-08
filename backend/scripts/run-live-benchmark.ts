import 'dotenv/config';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import { createConfigurationModel } from '../src/extraction/configurationModel.js';
import { createCompilerProvider } from '../src/providers/compilers/compiler.factory.js';
import { ExtractionExecutor } from '../src/extraction/executor.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { executionPolicy } from '../src/extraction/policy.js';
import type { DocumentAdapter, DocumentSnapshot } from '../src/extraction/contracts.js';

interface LiveTestConfig {
  id: string;
  name: string;
  url: string;
  prompt: string;
  expectedFields: string[];
}

const liveSites: LiveTestConfig[] = [
  {
    id: 'kabum',
    name: '1. KaBuM! (E-commerce Brasileiro Real)',
    url: 'https://www.kabum.com.br/produto/475438/placa-de-video-rx-6600-v2-asus-dual-amd-radeon-8gb-gddr6-dual-rx6600-8g-v2',
    prompt: 'Extraia o nome do produto e o preço à vista em reais',
    expectedFields: ['name', 'price'],
  },
  {
    id: 'g1',
    name: '2. G1 Globo (Portal de Notícias Real)',
    url: 'https://g1.globo.com',
    prompt: 'Extraia as principais notícias com título da matéria e link',
    expectedFields: ['title', 'link'],
  },
  {
    id: 'consul',
    name: '3. Consul Brasil (E-commerce Linha Branca Real)',
    url: 'https://www.consul.com.br/geladeira-frost-free-duplex-consul-crm44mb/p',
    prompt: 'Extraia o nome da geladeira e o preço em reais',
    expectedFields: ['name', 'price'],
  },
  {
    id: 'hackernews',
    name: '4. Hacker News (Agregador de Notícias em Tabela)',
    url: 'https://news.ycombinator.com/news',
    prompt: 'Extraia os posts com título e link para a notícia',
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

import * as cheerio from 'cheerio';

function createLiveAdapter(snapshot: DocumentSnapshot): DocumentAdapter {
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
  console.log('================================================================');
  console.log('   BENCHMARK COM SITES REAIS DA WEB (LIVE FETCH + PIPELINE)');
  console.log('================================================================');
  console.log(`Provider: ${process.env.COMPILER_PROVIDER ?? 'api'}`);
  console.log(`Model:    ${process.env.COMPILER_API_MODEL ?? 'gemini-3.5-flash-lite'}`);
  console.log('----------------------------------------------------------------\n');

  let passedTotal = 0;
  let failedTotal = 0;

  for (const site of liveSites) {
    if (filterId && site.id !== filterId) continue;

    console.log(`▶ [${site.id}] ${site.name}`);
    console.log(`  URL:    ${site.url}`);
    console.log(`  Prompt: "${site.prompt}"`);

    const start = Date.now();
    try {
      // 1. Live Fetch
      console.log('  1. Fazendo fetch do HTML ao vivo...');
      const fetchStart = Date.now();
      const snapshot = await fetchLiveDocument(site.url);
      console.log(
        `     HTML obtido com sucesso! (${(snapshot.html.length / 1024).toFixed(1)} KB em ${Date.now() - fetchStart}ms)`
      );

      // 2. Setup do Pipeline
      console.log('  2. Executando ConfigurationPipeline (Investigação + Decisão + Validação + Review)...');
      const adapter = createLiveAdapter(snapshot);
      const modelProvider = createCompilerProvider();
      const stages = createConfigurationModel(modelProvider);
      const executor = new ExtractionExecutor(
        { http: adapter, browser: adapter },
        new PageExtractor(standardSourceReaders()),
        executionPolicy()
      );

      const pipeline = new ConfigurationPipeline(stages, adapter, executor, {
        budgetMs: 90000,
        maxAttempts: 3,
        maxDecisions: 6,
        reviewReserveMs: 5000,
        evidenceLimit: 30000,
        semanticEnabled: true,
        semanticThreshold: 4,
      });

      // 3. Compilação e Extração
      const res = await pipeline.configure({
        jobId: `live-${site.id}`,
        url: site.url,
        prompt: site.prompt,
      });

      const totalDuration = Date.now() - start;
      const data = res.execution.data as Record<string, unknown>;
      const count =
        (data as { count?: number }).count ??
        ((data as { items?: unknown[] }).items?.length ?? 1);

      console.log(`  ✔ [PASS] Concluído em ${totalDuration}ms`);
      console.log(`    Modo:      ${res.plan.intent.mode} (Registros: ${count})`);
      console.log(`    Transport: ${res.plan.strategy.transport}`);
      console.log(`    Seletores: ${JSON.stringify(res.plan.strategy.fields)}`);
      console.log(`    Review:    Nota ${res.semanticReview.score}/10 (${res.semanticReview.status})`);
      if (res.plan.intent.mode === 'collection') {
        const items = (data as { items?: unknown[] }).items ?? [];
        console.log(`    Exemplo (2 primeiros itens):`);
        console.log(`    ${JSON.stringify(items.slice(0, 2), null, 4).replace(/\n/g, '\n    ')}`);
      } else {
        console.log(`    Dados:     ${JSON.stringify(data)}`);
      }
      console.log();
      passedTotal++;
    } catch (error) {
      console.log(`  ✖ [FAIL] Falha no teste ao vivo: ${error instanceof Error ? error.message : error}`);
      console.log();
      failedTotal++;
    }
  }

  console.log('================================================================');
  console.log(`RESULTADO FINAL LIVE SITES: ${passedTotal} PASSOU | ${failedTotal} FALHOU`);
  console.log('================================================================');

  if (failedTotal > 0) process.exitCode = 1;
}

const arg = process.argv.find((a) => a.startsWith('--site='));
const siteId = arg ? arg.split('=')[1] : undefined;

runLiveBenchmark(siteId).catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
