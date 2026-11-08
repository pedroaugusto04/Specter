import 'dotenv/config';
import { ConfigurationPipeline } from '../src/extraction/configuration.js';
import { createConfigurationModel } from '../src/extraction/configurationModel.js';
import { createCompilerProvider } from '../src/providers/compilers/compiler.factory.js';
import { ExtractionExecutor } from '../src/extraction/executor.js';
import { PageExtractor } from '../src/extraction/pageExtractor.js';
import { standardSourceReaders } from '../src/extraction/sources.js';
import { executionPolicy } from '../src/extraction/policy.js';
import { sameIntent } from '../src/extraction/configurationPolicy.js';
import type { DocumentAdapter, DocumentSnapshot } from '../src/extraction/contracts.js';

interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  url: string;
  prompt: string;
  html: string;
  responses?: DocumentSnapshot['responses'];
  intent?: import('../src/extraction/contracts.js').ExtractionIntent;
  validate: (result: import('../src/extraction/configuration.js').ConfigurationResult) => {
    passed: boolean;
    reason?: string;
  };
}

function createMockAdapter(
  getSnapshot: () => DocumentSnapshot
): DocumentAdapter {
  return {
    async open() {
      return {
        capabilities: { interactions: false, networkResponses: true, scopedDocuments: false },
        snapshot: async () => structuredClone(getSnapshot()),
        check: async () => undefined,
        advance: async () => {},
        discover: async () => structuredClone(getSnapshot()),
        screenshot: async () => undefined,
        close: async () => {},
      };
    },
  };
}

function createPipeline(adapter: DocumentAdapter) {
  const modelProvider = createCompilerProvider();
  const stages = createConfigurationModel(modelProvider);
  const executor = new ExtractionExecutor(
    { http: adapter, browser: adapter },
    new PageExtractor(standardSourceReaders()),
    executionPolicy()
  );

  return {
    pipeline: new ConfigurationPipeline(stages, adapter, executor, {
      budgetMs: 90000,
      maxAttempts: 3,
      maxDecisions: 6,
      reviewReserveMs: 5000,
      evidenceLimit: 25000,
      semanticEnabled: true,
      semanticThreshold: 4,
    }),
    executor,
  };
}

const scenarios: BenchmarkScenario[] = [
  // =========================================================================
  // CENÁRIO 1: Ambiguidade Extrema de Preços (De/Por/PIX/Parcelado/Cartão)
  // =========================================================================
  {
    id: 'ambiguous-prices',
    name: 'Cenário 1: Desambiguação de Preços em E-commerce Realista',
    description:
      'Página com múltiplos preços no DOM (preço riscado, parcelado 10x, à vista PIX e cartão da loja). Exige que o pipeline desambigue e capture o valor exato à vista no PIX.',
    url: 'https://ecommerce.example.com/smart-tv-55',
    prompt: 'Extraia o nome da TV e o preço à vista no PIX',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Smart TV 55 4K UHD</title></head>
      <body>
        <main class="product-wrapper">
          <h1 class="product-title">Smart TV 55" 4K UHD Crystal HDR10+</h1>
          <div class="pricing-container">
            <span class="price-strikethrough">De: R$ 3.899,00</span>
            <div class="spot-price-box">
              <span class="payment-method">À vista no PIX com 10% OFF:</span>
              <strong class="price-value">R$ 2.999,00</strong>
            </div>
            <div class="installment-box">
              <span class="installment-text">ou em até 10x de <span class="price-value">R$ 333,22</span> sem juros</span>
            </div>
            <div class="store-card-box">
              <span>no Cartão da Loja: <span class="price-value">R$ 3.199,00</span></span>
            </div>
          </div>
        </main>
      </body>
      </html>
    `,
    validate: (res) => {
      const data = res.execution.data as Record<string, unknown>;
      const price = Number(data.price ?? data.pix_price ?? data.spot_price);
      if (price === 2999) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Preço extraído foi ${price}, mas o esperado à vista no PIX era 2999 (não 3899, 333.22 ou 3199).`,
      };
    },
  },

  // =========================================================================
  // CENÁRIO 2: SPA Dinâmico via API JSON Interceptada (Observed Responses)
  // =========================================================================
  {
    id: 'observed-responses',
    name: 'Cenário 2: SPA com Payload em Resposta de Rede (Observed Responses)',
    description:
      'Página onde o DOM visível é apenas um shell vazio, mas os dados completos estão na resposta de rede /api/v2/products.',
    url: 'https://spa.example.com/products/headphone-pro',
    prompt: 'Extraia o título do fone, o preço atual e o status de disponibilidade em estoque',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Loja Virtual SPA</title></head>
      <body>
        <div id="app-root">
          <div class="skeleton-loader">Carregando catálogo...</div>
        </div>
      </body>
      </html>
    `,
    responses: [
      {
        url: 'https://spa.example.com/api/v2/products/headphone-pro',
        method: 'GET',
        status: 200,
        body: {
          success: true,
          product: {
            id: 'hd-9988',
            name: 'Fone de Ouvido Bluetooth Noise Cancelling Pro',
            pricing: {
              currentPrice: 799.9,
              currency: 'BRL',
            },
            inventory: {
              inStock: true,
              availableQuantity: 42,
            },
          },
        },
      },
    ],
    validate: (res) => {
      const data = res.execution.data as Record<string, unknown>;
      const hasTitle =
        typeof data.title === 'string' ||
        typeof data.name === 'string' ||
        typeof data.product_title === 'string';
      const hasPrice =
        data.price === 799.9 ||
        data.current_price === 799.9 ||
        Number(data.price) === 799.9;
      if (hasTitle && hasPrice) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Dados não foram extraídos corretamente da resposta de rede: ${JSON.stringify(data)}`,
      };
    },
  },

  // =========================================================================
  // CENÁRIO 3: Coleção Tabular Financeira com Regra de Trigger
  // =========================================================================
  {
    id: 'financial-table-alerts',
    name: 'Cenário 3: Tabela Densa de Cotações com Trigger Rule de Alerta',
    description:
      'Tabela com moedas e cotações de câmbio. Testa extração em modo collection, colunas específicas e regra de trigger de variação percentual.',
    url: 'https://finance.example.com/rates',
    prompt:
      'Extraia a tabela com todas as moedas, incluindo o código da moeda, a cotação de venda e a variação diária. Quero alerta se a variação for maior que 1%',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Cotações do Mercado</title></head>
      <body>
        <main>
          <h1>Painel de Moedas</h1>
          <table class="rates-table">
            <thead>
              <tr><th>Moeda</th><th>Compra</th><th>Venda</th><th>Variação</th></tr>
            </thead>
            <tbody>
              <tr data-currency="USD">
                <td class="code">USD/BRL</td>
                <td class="bid">5,6210</td>
                <td class="ask">5,6240</td>
                <td class="var positive">+1,45%</td>
              </tr>
              <tr data-currency="EUR">
                <td class="code">EUR/BRL</td>
                <td class="bid">6,0810</td>
                <td class="ask">6,0850</td>
                <td class="var negative">-0,32%</td>
              </tr>
              <tr data-currency="GBP">
                <td class="code">GBP/BRL</td>
                <td class="bid">7,1920</td>
                <td class="ask">7,1980</td>
                <td class="var positive">+0,18%</td>
              </tr>
              <tr data-currency="BTC">
                <td class="code">BTC/USD</td>
                <td class="bid">76.450</td>
                <td class="ask">76.500</td>
                <td class="var positive">+3,80%</td>
              </tr>
            </tbody>
          </table>
        </main>
      </body>
      </html>
    `,
    validate: (res) => {
      const mode = res.plan.intent.mode;
      const count =
        (res.execution.data as { count?: number }).count ??
        (res.execution.data as { items?: unknown[] }).items?.length ??
        0;
      const triggerRules = res.plan.intent.triggerRules;
      const hasTrigger = triggerRules.length > 0;
      if (mode === 'collection' && count === 4 && hasTrigger) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Esperava mode='collection', 4 itens e triggerRules configuradas. Obtido: mode=${mode}, count=${count}, triggerRules=${JSON.stringify(triggerRules)}`,
      };
    },
  },

  // =========================================================================
  // CENÁRIO 4: Filtragem Declarativa Pós-Conversão no Pipeline
  // =========================================================================
  {
    id: 'filtered-catalog',
    name: 'Cenário 4: Catálogo com Filtro Combinado Categoria + Preço Teto',
    description:
      'Catálogo misto com produtos de várias categorias e preços. O usuário pede apenas "Eletrônicos" abaixo de R$ 500, testando strategy.filters declarativos.',
    url: 'https://store.example.com/catalog',
    prompt:
      'Liste apenas os produtos da categoria Eletrônicos com preço menor que 500 reais, com nome, categoria e preço',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Catálogo Geral de Produtos</title></head>
      <body>
        <div class="product-grid">
          <div class="card" data-id="1">
            <h2 class="title">Mouse sem Fio Ergonômico</h2>
            <span class="category">Eletrônicos</span>
            <span class="price">R$ 149,90</span>
          </div>
          <div class="card" data-id="2">
            <h2 class="title">Teclado Mecânico RGB</h2>
            <span class="category">Eletrônicos</span>
            <span class="price">R$ 389,00</span>
          </div>
          <div class="card" data-id="3">
            <h2 class="title">Monitor UltraWide 34 polegadas</h2>
            <span class="category">Eletrônicos</span>
            <span class="price">R$ 2.499,00</span>
          </div>
          <div class="card" data-id="4">
            <h2 class="title">Livro Clean Architecture</h2>
            <span class="category">Livros</span>
            <span class="price">R$ 89,90</span>
          </div>
          <div class="card" data-id="5">
            <h2 class="title">Cadeira Ergonômica Mesh</h2>
            <span class="category">Móveis</span>
            <span class="price">R$ 899,00</span>
          </div>
        </div>
      </body>
      </html>
    `,
    validate: (res) => {
      const items =
        (res.execution.data as { items?: Array<{ price?: number; category?: string }> }).items ??
        [];
      const validCategories = items.every(
        (it) => !it.category || it.category.toLowerCase().includes('eletr')
      );
      const validPrices = items.every((it) => (it.price ?? 0) < 500);
      if (items.length === 2 && validCategories && validPrices) {
        return { passed: true };
      }
      return {
        passed: false,
        reason: `Esperava exatamente os 2 itens de eletrônicos abaixo de 500 (Mouse e Teclado). Obtido: ${items.length} itens (${JSON.stringify(items)})`,
      };
    },
  },

  // =========================================================================
  // CENÁRIO 5: Self-Healing Avançado com Mudança Drástica de Layout + Queda de Preço
  // =========================================================================
  {
    id: 'advanced-self-healing',
    name: 'Cenário 5: Self-Healing Avançado (Mudança de Layout + Mudança de Preço)',
    description:
      'Compila na V1. O site migra para V2 com classes totalmente novas e queda de preço. Testa recuperação com fixedIntent e cálculo de alteração.',
    url: 'https://store.example.com/item-premium',
    prompt: 'Monitore o título do console e o preço',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Console NextGen 1TB</title></head>
      <body>
        <div id="legacy-container">
          <h1 class="legacy-title">Console NextGen 1TB Edição Limitada</h1>
          <p class="legacy-price">R$ 4.499,00</p>
        </div>
      </body>
      </html>
    `,
    validate: (res) => {
      const data = res.execution.data as Record<string, unknown>;
      return {
        passed: Boolean(data.title || data.name) && Boolean(data.price),
      };
    },
  },
];

async function runScenario5Special(): Promise<boolean> {
  console.log('\n--- Executando Teste Especial: Ciclo Completo de Self-Healing ---');
  let currentHtml = `
    <html><body>
      <div id="legacy-container">
        <h1 class="legacy-title">Console NextGen 1TB</h1>
        <p class="legacy-price">R$ 4.499,00</p>
      </div>
    </body></html>
  `;

  const adapter = createMockAdapter(() => ({
    transport: 'http',
    html: currentHtml,
    url: 'https://store.example.com/console',
    httpStatus: 200,
    responses: [],
  }));

  const { pipeline, executor } = createPipeline(adapter);

  // 1. Compilação V1
  console.log('1. Compilando plano na V1...');
  const v1 = await pipeline.configure({
    jobId: 'heal-e2e',
    url: 'https://store.example.com/console',
    prompt: 'Extraia o nome do console e o preço',
  });
  console.log('   V1 compilado:', v1.execution.data);

  // 2. Mudança de layout para V2 (Next.js CSS Modules + Queda de preço)
  currentHtml = `
    <html><body>
      <main class="App_main__x82n">
        <h1 class="Product_name__38x">Console NextGen 1TB</h1>
        <div class="Product_salePrice__91k">R$ 3.999,00</div>
      </main>
    </body></html>
  `;

  // 3. Execução com plano antigo deve falhar
  console.log('2. Executando plano antigo no layout V2 (deve falhar)...');
  const runV1onV2 = await executor.execute('https://store.example.com/console', v1.plan);
  console.log('   Resultado na V2 com plano antigo:', runV1onV2.report.quality, runV1onV2.report.issues);

  // 4. Recompilação de Self-Healing com fixedIntent
  console.log('3. Disparando Self-Healing com fixedIntent travado...');
  const healed = await pipeline.configure({
    jobId: 'heal-e2e',
    url: 'https://store.example.com/console',
    prompt: 'Extraia o nome do console e o preço',
    intent: v1.plan.intent,
  });

  const same = sameIntent(v1.plan.intent, healed.plan.intent);
  const dataV2 = healed.execution.data as Record<string, unknown>;
  const priceDropped = Number(dataV2.price) === 3999;
  const selectorsUpdated = JSON.stringify(healed.plan.strategy.fields).includes('Product_');

  console.log('   Self-healing finalizado!');
  console.log('   - Intent preservado?', same);
  console.log('   - Novo preço capturado (R$ 3.999)?', priceDropped);
  console.log('   - Novos seletores da V2 aprendidos?', selectorsUpdated);
  console.log('   - Dados finais:', healed.execution.data);

  return same && priceDropped;
}

export async function runBenchmark(selectedId?: string) {
  console.log('================================================================');
  console.log('   SPECTER EXTRACTION & COMPILATION BENCHMARK SUITE');
  console.log('================================================================');
  console.log(`Provider: ${process.env.COMPILER_PROVIDER ?? 'api'}`);
  console.log(`Model:    ${process.env.COMPILER_API_MODEL ?? 'gemini-3.5-flash-lite'}`);
  console.log('----------------------------------------------------------------\n');

  let passedTotal = 0;
  let failedTotal = 0;

  for (const scenario of scenarios) {
    if (selectedId && scenario.id !== selectedId) continue;

    console.log(`▶ [${scenario.id}] ${scenario.name}`);
    console.log(`  Descrição: ${scenario.description}`);
    console.log(`  Prompt:    "${scenario.prompt}"`);

    const start = Date.now();
    try {
      if (scenario.id === 'advanced-self-healing') {
        const ok = await runScenario5Special();
        if (ok) {
          console.log(`  ✔ [PASS] ${scenario.name} (Tempo: ${Date.now() - start}ms)\n`);
          passedTotal++;
        } else {
          console.log(`  ✖ [FAIL] ${scenario.name} - Self-healing não concluiu todos os requisitos.\n`);
          failedTotal++;
        }
        continue;
      }

      const adapter = createMockAdapter(() => ({
        transport: 'http',
        html: scenario.html,
        url: scenario.url,
        httpStatus: 200,
        responses: scenario.responses ?? [],
      }));

      const { pipeline } = createPipeline(adapter);

      const result = await pipeline.configure({
        jobId: `bench-${scenario.id}`,
        url: scenario.url,
        prompt: scenario.prompt,
        intent: scenario.intent,
      });

      const duration = Date.now() - start;
      const validation = scenario.validate(result);

      if (validation.passed) {
        console.log(`  ✔ [PASS] Concluído em ${duration}ms (Review: ${result.semanticReview.score}/10)`);
        console.log(`    Transport: ${result.plan.strategy.transport} | Mode: ${result.plan.intent.mode}`);
        console.log(`    Dados:     ${JSON.stringify(result.execution.data)}`);
        console.log();
        passedTotal++;
      } else {
        console.log(`  ✖ [FAIL] Validação falhou: ${validation.reason}`);
        console.log(`    Dados extraídos: ${JSON.stringify(result.execution.data)}`);
        console.log(`    Estratégia:      ${JSON.stringify(result.plan.strategy.fields)}`);
        console.log();
        failedTotal++;
      }
    } catch (error) {
      console.log(`  ✖ [FAIL] Erro durante execução: ${error instanceof Error ? error.message : error}`);
      console.log();
      failedTotal++;
    }
  }

  console.log('================================================================');
  console.log(`RESULTADO FINAL DO BENCHMARK: ${passedTotal} PASSOU | ${failedTotal} FALHOU`);
  console.log('================================================================');

  if (failedTotal > 0) process.exitCode = 1;
}

// Execução via linha de comando
const arg = process.argv.find((a) => a.startsWith('--scenario='));
const scenarioId = arg ? arg.split('=')[1] : undefined;

runBenchmark(scenarioId).catch((err) => {
  console.error('Erro fatal no benchmark:', err);
  process.exit(1);
});
