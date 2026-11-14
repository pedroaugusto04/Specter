/**
 * Synthetic benchmark (tier T1): controlled pages served through mock document adapters,
 * configured by the real compiler provider.
 *
 * Provider-agnostic: uses COMPILER_PROVIDER / COMPILER_API_MODEL, or the CLI overrides.
 *   npm run test:benchmark -- --provider=agy --runs=3
 *   npm run test:benchmark -- --case=ambiguous-prices
 * Report: reports/evals/<provider>/synthetic/latest/summary.md
 */
import 'dotenv/config';
import { applyProviderOverride, parseEvalArgs, selectEvalCases } from '../src/evals/cli.js';
import type { EvalTags, EvalVerdict } from '../src/evals/types.js';
import type { PipelineJudge } from '../src/evals/pipelineExecution.js';
import type { DocumentSnapshot } from '../src/extraction/contracts.js';

const CORRECT: EvalVerdict = { outcome: 'CORRECT' };
const wrong = (reason: string): EvalVerdict => ({ outcome: 'WRONG_VALUE', reason });

interface SyntheticCase {
  id: string;
  name: string;
  description: string;
  url: string;
  prompt: string;
  /** Page versions; more than one exercises self-healing (compile on v1, heal on the last). */
  versions: string[];
  responses?: DocumentSnapshot['responses'];
  tags: EvalTags;
  judge: PipelineJudge;
}

const scenarios: SyntheticCase[] = [
  {
    id: 'ambiguous-prices',
    name: 'Desambiguação de preços em e-commerce (De/Por/PIX/parcelado/cartão)',
    description: 'Vários preços no DOM; o pipeline deve capturar o valor à vista no PIX.',
    url: 'https://ecommerce.example.com/smart-tv-55',
    prompt: 'Extraia o nome da TV e o preço à vista no PIX',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'single', locale: 'pt-BR', challenges: ['ambiguous-price'] },
    versions: [
      `<!DOCTYPE html><html><head><title>Smart TV 55 4K UHD</title></head><body>
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
            <div class="store-card-box"><span>no Cartão da Loja: <span class="price-value">R$ 3.199,00</span></span></div>
          </div>
        </main></body></html>`,
    ],
    judge: ([record]) => {
      const price = Number(pickField(record, 'price', 'pix_price', 'spot_price', 'preco'));
      return price === 2999
        ? CORRECT
        : wrong(`Preço extraído foi ${price}; esperado 2999 (não 3899, 333.22 ou 3199).`);
    },
  },
  {
    id: 'observed-responses',
    name: 'SPA com payload em resposta de rede',
    description: 'DOM é apenas um shell; os dados estão na resposta /api/v2/products.',
    url: 'https://spa.example.com/products/headphone-pro',
    prompt: 'Extraia o título do fone, o preço atual e o status de disponibilidade em estoque',
    tags: { siteType: 'ecommerce', render: 'csr-spa', dataSource: 'network-json', mode: 'single', locale: 'pt-BR' },
    versions: [
      `<!DOCTYPE html><html><head><title>Loja Virtual SPA</title></head><body>
        <div id="app-root"><div class="skeleton-loader">Carregando catálogo...</div></div></body></html>`,
    ],
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
            pricing: { currentPrice: 799.9, currency: 'BRL' },
            inventory: { inStock: true, availableQuantity: 42 },
          },
        },
      },
    ],
    judge: ([record]) => {
      const title = pickField(record, 'title', 'name', 'product_title', 'titulo');
      const price = Number(pickField(record, 'price', 'current_price', 'preco'));
      return typeof title === 'string' && price === 799.9
        ? CORRECT
        : wrong(`Dados não vieram corretamente da resposta de rede: ${JSON.stringify(record)}`);
    },
  },
  {
    id: 'financial-table-alerts',
    name: 'Tabela densa de cotações com regra de alerta',
    description: 'Modo collection, colunas específicas e trigger de variação percentual.',
    url: 'https://finance.example.com/rates',
    prompt:
      'Extraia a tabela com todas as moedas, incluindo o código da moeda, a cotação de venda e a variação diária. Quero alerta se a variação for maior que 1%',
    tags: { siteType: 'finance', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'pt-BR', challenges: ['trigger-rule'] },
    versions: [
      `<!DOCTYPE html><html><head><title>Cotações do Mercado</title></head><body><main>
        <h1>Painel de Moedas</h1>
        <table class="rates-table">
          <thead><tr><th>Moeda</th><th>Compra</th><th>Venda</th><th>Variação</th></tr></thead>
          <tbody>
            <tr data-currency="USD"><td class="code">USD/BRL</td><td class="bid">5,6210</td><td class="ask">5,6240</td><td class="var positive">+1,45%</td></tr>
            <tr data-currency="EUR"><td class="code">EUR/BRL</td><td class="bid">6,0810</td><td class="ask">6,0850</td><td class="var negative">-0,32%</td></tr>
            <tr data-currency="GBP"><td class="code">GBP/BRL</td><td class="bid">7,1920</td><td class="ask">7,1980</td><td class="var positive">+0,18%</td></tr>
            <tr data-currency="BTC"><td class="code">BTC/USD</td><td class="bid">76.450</td><td class="ask">76.500</td><td class="var positive">+3,80%</td></tr>
          </tbody>
        </table></main></body></html>`,
    ],
    judge: (records, result) => {
      const { mode, triggerRules } = result.plan.intent;
      if (mode === 'collection' && records.length === 4 && triggerRules.length > 0) return CORRECT;
      if (records.length < 4)
        return { outcome: 'PARTIAL', reason: `Esperava 4 moedas, obtido ${records.length}.` };
      return wrong(
        `Esperava mode=collection, 4 itens e triggerRules. Obtido: mode=${mode}, count=${records.length}, triggerRules=${JSON.stringify(triggerRules)}`
      );
    },
  },
  {
    id: 'filtered-catalog',
    name: 'Catálogo com filtro combinado categoria + preço teto',
    description: 'Apenas "Eletrônicos" abaixo de R$ 500 (strategy.filters declarativos).',
    url: 'https://store.example.com/catalog',
    prompt:
      'Liste apenas os produtos da categoria Eletrônicos com preço menor que 500 reais, com nome, categoria e preço',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'pt-BR', challenges: ['filter'] },
    versions: [
      `<!DOCTYPE html><html><head><title>Catálogo Geral de Produtos</title></head><body>
        <div class="product-grid">
          <div class="card" data-id="1"><h2 class="title">Mouse sem Fio Ergonômico</h2><span class="category">Eletrônicos</span><span class="price">R$ 149,90</span></div>
          <div class="card" data-id="2"><h2 class="title">Teclado Mecânico RGB</h2><span class="category">Eletrônicos</span><span class="price">R$ 389,00</span></div>
          <div class="card" data-id="3"><h2 class="title">Monitor UltraWide 34 polegadas</h2><span class="category">Eletrônicos</span><span class="price">R$ 2.499,00</span></div>
          <div class="card" data-id="4"><h2 class="title">Livro Clean Architecture</h2><span class="category">Livros</span><span class="price">R$ 89,90</span></div>
          <div class="card" data-id="5"><h2 class="title">Cadeira Ergonômica Mesh</h2><span class="category">Móveis</span><span class="price">R$ 899,00</span></div>
        </div></body></html>`,
    ],
    judge: (records) => {
      const valid = records.every((record) => {
        const category = pickField(record, 'category', 'categoria');
        return (
          (!category || String(category).toLowerCase().includes('eletr')) &&
          Number(pickField(record, 'price', 'preco') ?? 0) < 500
        );
      });
      return records.length === 2 && valid
        ? CORRECT
        : wrong(`Esperava apenas Mouse e Teclado. Obtido ${records.length}: ${JSON.stringify(records)}`);
    },
  },
  {
    id: 'advanced-self-healing',
    name: 'Self-healing: mudança drástica de layout + queda de preço',
    description: 'Compila na v1; o site migra para CSS Modules e o preço cai. Recupera com intent travado?',
    url: 'https://store.example.com/console',
    prompt: 'Extraia o nome do console e o preço',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'single', locale: 'pt-BR', challenges: ['layout-drift', 'css-modules-hash'] },
    versions: [
      `<html><body><div id="legacy-container">
        <h1 class="legacy-title">Console NextGen 1TB</h1><p class="legacy-price">R$ 4.499,00</p>
      </div></body></html>`,
      `<html><body><main class="App_main__x82n">
        <h1 class="Product_name__38x">Console NextGen 1TB</h1><div class="Product_salePrice__91k">R$ 3.999,00</div>
      </main></body></html>`,
    ],
    judge: ([record]) => {
      const price = Number(pickField(record, 'price', 'preco'));
      return price === 3999 ? CORRECT : wrong(`Após healing, preço ${price}; esperado 3999.`);
    },
  },
  {
    id: 'bilingual-currency',
    name: 'Formatação Monetária Europeia (€ 1.299,50)',
    description: 'Página em idioma estrangeiro com símbolo de Euro e formatação com ponto e vírgula invertidos.',
    url: 'https://store.example.de/laptop',
    prompt: 'Extraia o modelo do notebook e o preço em euros',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'single', locale: 'de-DE', challenges: ['currency-format'] },
    versions: [
      `<!DOCTYPE html><html><head><title>Gaming Laptop Pro 16</title></head><body>
        <main class="product-page">
          <h1 class="item-title">Gaming Laptop Pro 16" OLED 32GB RAM</h1>
          <div class="pricing">
            <span class="old-price">1.599,00 €</span>
            <span class="special-offer">Jetzt nur <strong class="current-price">1.299,50 €</strong> inkl. MwSt.</span>
          </div>
        </main></body></html>`,
    ],
    judge: ([record]) => {
      const title = pickField(record, 'model', 'title', 'name', 'item');
      const rawPrice = pickField(record, 'price', 'preis', 'valor');
      const normalizedPrice =
        typeof rawPrice === 'number'
          ? rawPrice
          : parseFloat(String(rawPrice ?? '').replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.'));
      return typeof title === 'string' && (normalizedPrice === 1299.5 || String(rawPrice).includes('1.299,50'))
        ? CORRECT
        : wrong(`Esperava 1299.5 ou string contendo 1.299,50. Obtido: raw=${rawPrice}, parsed=${normalizedPrice}, title=${title}`);
    },
  },
  {
    id: 'complex-data-attributes',
    name: 'Atributos Estruturados data-* no DOM',
    description: 'Catálogo onde metadados confiáveis de preço e SKU estão em atributos data-* das tags HTML.',
    url: 'https://tech.example.com/gpus',
    prompt: 'Extraia os produtos com o nome da placa, o código SKU e o preço numérico',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'pt-BR', challenges: ['data-attributes'] },
    versions: [
      `<!DOCTYPE html><html><body>
        <div class="catalog-grid">
          <div class="card">
            <h3 class="name">GeForce RTX 4070 Ti 12GB</h3>
            <span class="sku-tag" data-sku="GPU-4070-TI">SKU: GPU-4070-TI</span>
            <span class="price-val" data-price="4399.00">R$ 4.399,00 à vista</span>
          </div>
          <div class="card">
            <h3 class="name">Radeon RX 7800 XT 16GB</h3>
            <span class="sku-tag" data-sku="GPU-7800-XT">SKU: GPU-7800-XT</span>
            <span class="price-val" data-price="3899.00">R$ 3.899,00 à vista</span>
          </div>
        </div></body></html>`,
    ],
    judge: (records) => {
      if (records.length !== 2) return wrong(`Esperava 2 placas, obteve ${records.length}`);
      const valid = records.every((r) => {
        const sku = String(pickField(r, 'sku', 'code') ?? '');
        const price = Number(String(pickField(r, 'price', 'preco') ?? '').replace(/[^\d.]/g, ''));
        return (sku.includes('4070') || sku.includes('7800') || sku.startsWith('GPU-')) && price > 3000;
      });
      return valid ? CORRECT : wrong(`Registros não capturaram SKU ou Preço numérico: ${JSON.stringify(records)}`);
    },
  },
  {
    id: 'tabular-job-board',
    name: 'Mural Tabular de Vagas com Departamento e Modalidade',
    description: 'Tabela densa de vagas corporativas com múltiplas colunas e tags de modalidade.',
    url: 'https://careers.example.com/openings',
    prompt: 'Extraia a tabela com todas as vagas, incluindo o cargo, o departamento e a modalidade',
    tags: { siteType: 'jobs', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'pt-BR' },
    versions: [
      `<!DOCTYPE html><html><body>
        <table class="careers-table">
          <thead><tr><th>Cargo</th><th>Departamento</th><th>Local / Modalidade</th></tr></thead>
          <tbody>
            <tr><td class="role">Engenheiro de Software Sênior</td><td class="dept">Tecnologia</td><td class="mode">Remoto (Brasil)</td></tr>
            <tr><td class="role">Designer de Produto (UI/UX)</td><td class="dept">Design</td><td class="mode">Híbrido (São Paulo)</td></tr>
            <tr><td class="role">Gerente de Contas B2B</td><td class="dept">Vendas</td><td class="mode">Presencial (Curitiba)</td></tr>
          </tbody>
        </table></body></html>`,
    ],
    judge: (records) => {
      if (records.length !== 3) return wrong(`Esperava 3 vagas, obteve ${records.length}`);
      const hasFields = records.every((r) => {
        const role = pickField(r, 'role', 'cargo', 'title');
        const dept = pickField(r, 'dept', 'department', 'departamento');
        return Boolean(role) && Boolean(dept);
      });
      return hasFields ? CORRECT : wrong(`Vagas incompletas: ${JSON.stringify(records)}`);
    },
  },
];

// Loaded lazily (see main) so this module stays importable before the env override.
let pickField: typeof import('../src/evals/oracle.js').pickField;

async function main() {
  const options = parseEvalArgs(process.argv.slice(2));
  // Must happen before any module that validates the environment is imported.
  applyProviderOverride(options);

  const [
    { ConfigurationPipeline },
    { createConfigurationModel },
    { createCompilerProvider },
    { ExtractionExecutor },
    { PageExtractor },
    { standardSourceReaders },
    { executionPolicy },
    { sameIntent },
    { CountingModelProvider },
    { runEvalSuite },
    { evaluatePipelineResult },
    oracle,
    { classifyEvalError },
  ] = await Promise.all([
    import('../src/extraction/configuration.js'),
    import('../src/extraction/configurationModel.js'),
    import('../src/providers/compilers/compiler.factory.js'),
    import('../src/extraction/executor.js'),
    import('../src/extraction/pageExtractor.js'),
    import('../src/extraction/sources.js'),
    import('../src/extraction/policy.js'),
    import('../src/extraction/configurationPolicy.js'),
    import('../src/extraction/configurationEvaluation.js'),
    import('../src/evals/runner.js'),
    import('../src/evals/pipelineExecution.js'),
    import('../src/evals/oracle.js'),
    import('../src/evals/outcomes.js'),
  ]);
  pickField = oracle.pickField;
  const modelProvider = createCompilerProvider(
    options.provider as 'agy' | 'codex' | 'api' | undefined,
    options.model ? { model: options.model } : undefined
  );

  const report = await runEvalSuite({
    suite: 'synthetic',
    tier: 'T1',
    cases: selectEvalCases(scenarios, options),
    options,
    delayMs: 2000,
    execute: async (scenario, run) => {
      let html = scenario.versions[0]!;
      const snapshot = (): DocumentSnapshot => ({
        transport: 'http',
        html,
        url: scenario.url,
        httpStatus: 200,
        responses: scenario.responses ?? [],
      });
      const adapter = {
        async open() {
          return {
            capabilities: { interactions: false, networkResponses: true, scopedDocuments: false },
            snapshot: async () => structuredClone(snapshot()),
            check: async () => undefined,
            advance: async () => {},
            discover: async () => structuredClone(snapshot()),
            screenshot: async () => undefined,
            close: async () => {},
          };
        },
      };
      const counted = new CountingModelProvider(modelProvider);
      const executor = new ExtractionExecutor(
        { http: adapter, browser: adapter },
        new PageExtractor(standardSourceReaders()),
        executionPolicy()
      );
      const pipeline = new ConfigurationPipeline(createConfigurationModel(counted), adapter, executor, {
        budgetMs: 90000,
        maxAttempts: 3,
        maxDecisions: 6,
        reviewReserveMs: 5000,
        evidenceLimit: 25000,
        semanticEnabled: true,
        semanticThreshold: 4,
      });
      const request = { jobId: `bench-${scenario.id}-${run}`, url: scenario.url, prompt: scenario.prompt };

      try {
        let result = await pipeline.configure(request);
        for (const version of scenario.versions.slice(1)) {
          // Layout drift: heal with the original intent locked, as production does.
          html = version;
          const intent = result.plan.intent;
          result = await pipeline.configure({ ...request, intent });
          if (!sameIntent(intent, result.plan.intent))
            return {
              outcome: 'WRONG_VALUE',
              reason: 'Self-healing alterou o intent travado.',
              records: 0,
              modelCalls: counted.totalCalls,
            };
        }
        return evaluatePipelineResult(result, scenario.judge, counted.totalCalls);
      } catch (error) {
        return { ...classifyEvalError(error), records: 0, modelCalls: counted.totalCalls };
      }
    },
  });

  if (report.summary.overall.passed < report.summary.overall.scored) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Erro fatal no benchmark sintético:', error);
  process.exit(1);
});
