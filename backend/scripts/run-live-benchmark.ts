/**
 * Live web benchmark (tier T3): real websites through the production extraction stack.
 *
 * Provider-agnostic: uses COMPILER_PROVIDER / COMPILER_API_MODEL, or the CLI overrides.
 *   npm run test:live -- --provider=codex --runs=3
 *   npm run test:live -- --provider=api --model=gemini-3.5-flash-lite --tag siteType=news
 *   npm run test:live -- --case=hackernews,quotes
 * Report: reports/evals/<provider>/live-web/latest/summary.md
 */
import 'dotenv/config';
import { applyProviderOverride, parseEvalArgs, selectEvalCases } from '../src/evals/cli.js';
import type { InvariantOracle } from '../src/evals/oracle.js';
import type { EvalTags } from '../src/evals/types.js';
import type { ILeaseStore, ResourceLease } from '../src/resources/lease.js';

export interface LiveBenchmarkCase {
  id: string;
  name: string;
  url: string;
  prompt: string;
  description: string;
  tags: EvalTags;
  oracle: InvariantOracle;
}

const text = (...aliases: string[]) => ({ aliases, kind: 'text' as const });
const number = (...aliases: string[]) => ({ aliases, kind: 'number' as const });
const url = (...aliases: string[]) => ({ aliases, kind: 'url' as const });

export const liveBenchmarkSuite: LiveBenchmarkCase[] = [
  // =========================================================================
  // 1. Notícias & Jornalismo Geral (Brasil)
  // =========================================================================
  {
    id: 'g1',
    name: 'G1 Globo (Portal líder de notícias do Brasil)',
    url: 'https://g1.globo.com',
    prompt: 'Extraia as principais notícias com título da matéria e link',
    description: 'Portal de alto tráfego com manchetes, links e blocos editoriais ao vivo.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'manchete'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'uol',
    name: 'UOL Notícias (Portal de jornalismo e entretenimento BR)',
    url: 'https://www.uol.com.br/',
    prompt: 'Extraia as manchetes com o título da notícia e o link',
    description: 'Portal brasileiro de altíssimo volume com manchetes rotativas.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'manchete'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'r7',
    name: 'R7 Notícias (Portal de notícias Record)',
    url: 'https://noticias.r7.com/',
    prompt: 'Extraia as notícias com o título da matéria e o link',
    description: 'Portal de notícias com manchetes jornalísticas e destaques editoriais.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'terra',
    name: 'Terra Notícias (Portal de notícias e variedades BR)',
    url: 'https://www.terra.com.br/noticias/',
    prompt: 'Extraia as principais notícias com título e link',
    description: 'Portal histórico brasileiro com grid de manchetes e links de notícias.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'metropoles',
    name: 'Metrópoles (Portal de notícias e investigações)',
    url: 'https://www.metropoles.com/',
    prompt: 'Extraia as manchetes com o título da notícia e o link',
    description: 'Portal jornalístico dinâmico com manchetes em cards visuais.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 3, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'poder360',
    name: 'Poder360 (Jornalismo político e econômico)',
    url: 'https://www.poder360.com.br/',
    prompt: 'Extraia as notícias com o título da reportagem e o link',
    description: 'Portal especializado em cobertura política e econômica institucional.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'cnnbrasil',
    name: 'CNN Brasil (Canal de notícias 24h e digital)',
    url: 'https://www.cnnbrasil.com.br/',
    prompt: 'Extraia as principais notícias com a manchete e o link da matéria',
    description: 'Canal jornalístico com manchetes e destaques nacionais e internacionais.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'manchete'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 2. Notícias Internacionais & Imprensa Global
  // =========================================================================
  {
    id: 'bbc-news',
    name: 'BBC News (Portal jornalístico global britânico)',
    url: 'https://www.bbc.com/news',
    prompt: 'Extraia as principais notícias com a manchete e o link da reportagem',
    description: 'Portal internacional com manchetes responsivas em inglês.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'en-GB' },
    oracle: { minRecords: 3, fields: { headline: text('headline', 'title', 'manchete'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'guardian-tech',
    name: 'The Guardian Tech (Jornalismo britânico em tecnologia)',
    url: 'https://www.theguardian.com/technology',
    prompt: 'Extraia as notícias de tecnologia com o título da matéria e o link',
    description: 'Seção especializada de tecnologia de portal britânico centenário.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-GB' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'titulo'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'npr-news',
    name: 'NPR News (Rádio pública e portal de notícias dos EUA)',
    url: 'https://www.npr.org/sections/news/',
    prompt: 'Extraia as notícias com o título da reportagem e o link',
    description: 'Portal de notícias da National Public Radio americana.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'nyt-tech',
    name: 'The New York Times Tech (Seção de tecnologia do NYT)',
    url: 'https://www.nytimes.com/section/technology',
    prompt: 'Extraia as notícias com a manchete e o link do artigo',
    description: 'Cobertura de tecnologia de alto padrão com manchetes e links de artigos.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 4, fields: { title: text('title', 'headline', 'manchete'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 3. Mídia de Tecnologia, Inovação & Startups
  // =========================================================================
  {
    id: 'techcrunch',
    name: 'TechCrunch (Portal de venture capital e startups)',
    url: 'https://techcrunch.com/',
    prompt: 'Extraia as notícias com o título da matéria e o link do artigo',
    description: 'Portal global de referência em startups, tecnologia e capital de risco.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'titulo'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'theverge',
    name: 'The Verge (Cultura digital, hardware e ciência)',
    url: 'https://www.theverge.com/',
    prompt: 'Extraia as matérias com o título e o link da publicação',
    description: 'Portal moderno com layout visualmente denso e notícias de eletrônicos.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'wired',
    name: 'Wired (Revista e portal de inovação tecnológica)',
    url: 'https://www.wired.com/',
    prompt: 'Extraia os artigos com o título da matéria e o link',
    description: 'Portal internacional de cultura digital, cibersegurança e inteligência artificial.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'article'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'engadget',
    name: 'Engadget (Reviews de gadgets e notícias de eletrônicos)',
    url: 'https://www.engadget.com/',
    prompt: 'Extraia as notícias de gadgets com o título e o link',
    description: 'Portal histórico de reviews de eletrônicos e novidades de consumo.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'name'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 4. Fóruns, Comunidades Técnicas & Discussões
  // =========================================================================
  {
    id: 'hackernews',
    name: 'Hacker News (Agregador clássico em tabela aninhada)',
    url: 'https://news.ycombinator.com/news',
    prompt: 'Extraia os posts com título e link para a notícia',
    description: 'Agregador tradicional em linhas HTML com links externos e pontuações.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 20, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'hn-best',
    name: 'Hacker News Best (Destaques históricos mais votados da YC)',
    url: 'https://news.ycombinator.com/best',
    prompt: 'Extraia as histórias mais votadas com título e link',
    description: 'Seção com os artigos e links de maior repercussão no Hacker News.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 20, fields: { title: text('title', 'titulo', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'lobste.rs',
    name: 'Lobsters (Feed técnico de desenvolvedores)',
    url: 'https://lobste.rs',
    prompt: 'Extraia as postagens com o título da história e o link para a discussão',
    description: 'Agregador moderno para engenheiros de software com pontuações e tags.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 15, fields: { title: text('title', 'story', 'titulo'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'devto',
    name: 'Dev.to (Comunidade de artigos de programação)',
    url: 'https://dev.to/',
    prompt: 'Extraia os artigos com o título da publicação e o link',
    description: 'Comunidade internacional aberta de artigos práticos de desenvolvimento.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 10, fields: { title: text('title', 'article', 'post'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'slashdot',
    name: 'Slashdot (Notícias de tecnologia e código aberto)',
    url: 'https://slashdot.org/',
    prompt: 'Extraia as notícias com o título da história e o link',
    description: 'Pioneiro em discussões de tecnologia, software livre e nerd stuff.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 10, fields: { title: text('title', 'story', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'reddit-tech',
    name: 'Reddit Technology (Fórum com proteção anti-bot e votos)',
    url: 'https://old.reddit.com/r/technology/',
    prompt: 'Extraia os posts com o título da publicação e o número de votos',
    description: 'Comunidade com pontuações numéricas, testando a cascata de unblockers.',
    tags: { siteType: 'forum', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'cloudflare' },
    oracle: {
      minRecords: 10,
      minValidRatio: 0.8,
      fields: { title: text('title', 'titulo'), votes: number('votes', 'score', 'upvotes', 'points', 'votos') },
    },
  },

  // =========================================================================
  // 5. Vagas, Recrutamento & Emprego Remoto
  // =========================================================================
  {
    id: 'hn-jobs',
    name: 'Hacker News Jobs (Mural de vagas técnicas da Y Combinator)',
    url: 'https://news.ycombinator.com/jobs',
    prompt: 'Extraia as oportunidades de emprego com o título da vaga e o link',
    description: 'Mural limpo de contratações de tecnologia de startups da YC.',
    tags: { siteType: 'jobs', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 15, fields: { title: text('title', 'role', 'job', 'titulo'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'remotive',
    name: 'Remotive (Job board de trabalho remoto internacional)',
    url: 'https://remotive.com/',
    prompt: 'Extraia as vagas de emprego remoto com o cargo e o nome da empresa',
    description: 'Plataforma líder em vagas de tecnologia e marketing 100% remotas.',
    tags: { siteType: 'jobs', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { role: text('role', 'cargo', 'title', 'position'), company: text('company', 'empresa') } },
  },
  {
    id: 'cryptojobslist',
    name: 'Crypto Jobs List (Vagas em Web3 e Blockchain)',
    url: 'https://cryptojobslist.com/',
    prompt: 'Extraia as vagas com o cargo e a empresa contratante',
    description: 'Job board temático de criptoativos, finanças descentralizadas e Web3.',
    tags: { siteType: 'jobs', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { role: text('role', 'cargo', 'title'), company: text('company', 'empresa') } },
  },

  // =========================================================================
  // 6. Feeds Técnicos, Repositórios & Changelogs
  // =========================================================================
  {
    id: 'github-nextjs',
    name: 'GitHub Releases Next.js (Changelog de releases do Next.js)',
    url: 'https://github.com/vercel/next.js/releases',
    prompt: 'Extraia as versões lançadas com a tag da versão e o link correspondente da release',
    description: 'DOM técnico aninhado, repleto de SVGs, botões dinâmicos e links relativos.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { tag: text('tag', 'version', 'versao', 'name', 'title'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'github-react',
    name: 'GitHub Releases React (Changelog oficial do React)',
    url: 'https://github.com/facebook/react/releases',
    prompt: 'Extraia as versões do React com a tag da versão e o link da release',
    description: 'Histórico de versões de software em estrutura padrão do GitHub.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { tag: text('tag', 'version', 'versao', 'name', 'title'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'github-tailwind',
    name: 'GitHub Releases Tailwind CSS (Changelog do framework CSS)',
    url: 'https://github.com/tailwindlabs/tailwindcss/releases',
    prompt: 'Extraia as versões lançadas com a tag e o link da release',
    description: 'Releases do projeto de estilização Tailwind.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { tag: text('tag', 'version', 'versao', 'name'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'github-vscode',
    name: 'GitHub Releases VS Code (Changelog do editor de código)',
    url: 'https://github.com/microsoft/vscode/releases',
    prompt: 'Extraia as versões do VS Code com o nome da versão e o link',
    description: 'Histórico de versões do editor Visual Studio Code da Microsoft.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { version: text('version', 'tag', 'name', 'title'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'github-vue',
    name: 'GitHub Releases Vue.js (Changelog do framework Vue)',
    url: 'https://github.com/vuejs/core/releases',
    prompt: 'Extraia as versões do Vue com a tag da release e o link',
    description: 'Releases do core do Vue.js.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { tag: text('tag', 'version', 'name'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'github-electron',
    name: 'GitHub Releases Electron (Changelog do runtime Electron)',
    url: 'https://github.com/electron/electron/releases',
    prompt: 'Extraia as versões com a tag da versão e o link correspondente',
    description: 'Changelog de versões do framework de desktop Electron.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { tag: text('tag', 'version', 'name'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'pypi-trending',
    name: 'PyPI Python Packages (Repositório oficial de pacotes Python)',
    url: 'https://pypi.org/',
    prompt: 'Extraia os pacotes em destaque com o nome do pacote e a descrição',
    description: 'Portal oficial da Python Software Foundation para distribuição de bibliotecas.',
    tags: { siteType: 'changelog', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { name: text('name', 'package', 'title'), description: text('description', 'desc', 'summary') } },
  },
  {
    id: 'mdn-js',
    name: 'MDN Web Docs (Documentação oficial de JavaScript)',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects',
    prompt: 'Extraia os objetos globais do JavaScript com o nome do objeto e o link da documentação',
    description: 'Documentação canônica de padrões web mantida pela Mozilla.',
    tags: { siteType: 'docs', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 15, fields: { name: text('name', 'object', 'title'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 7. Dados Públicos, Estatísticas & Tabelas Enciclopédicas
  // =========================================================================
  {
    id: 'wiki-films',
    name: 'Wikipedia Bilheterias (Maiores bilheterias da história do cinema)',
    url: 'https://en.wikipedia.org/wiki/List_of_highest-grossing_films',
    prompt: 'Extraia os filmes de maior bilheteria com o título do filme e o faturamento mundial (worldwide gross)',
    description: 'Wikitable com dezenas de linhas de filmes, links e valores em dólares.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        title: text('title', 'filme', 'film', 'name'),
        gross: text('gross', 'worldwide_gross', 'faturamento', 'revenue', 'bilheteria'),
      },
    },
  },
  {
    id: 'wiki-population',
    name: 'Wikipedia População Mundial (Tabela de países por população)',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population',
    prompt: 'Extraia os países com o nome do país e a população atual',
    description: 'Tabela demográfica global oficial da Wikipedia com centenas de linhas.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 30,
      fields: {
        country: text('country', 'pais', 'nation', 'name', 'location'),
        population: number('population', 'populacao'),
      },
    },
  },
  {
    id: 'wiki-area',
    name: 'Wikipedia Área Territorial (Países ordenados por extensão territorial)',
    url: 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area',
    prompt: 'Extraia a tabela de países com o nome do país e a área total em km²',
    description: 'Tabela geográfica com áreas territoriais em quilômetros quadrados.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 30,
      fields: {
        country: text('country', 'pais', 'nation', 'name'),
        area: number('area', 'total_area', 'sq_km'),
      },
    },
  },
  {
    id: 'wiki-companies',
    name: 'Wikipedia Maiores Empresas (Ranking global por faturamento)',
    url: 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue',
    prompt: 'Extraia as empresas com o nome da empresa e o faturamento em dólares',
    description: 'Ranking Fortune Global 500 com corporações multinacionais.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        company: text('company', 'empresa', 'name'),
        revenue: text('revenue', 'faturamento', 'gross', 'receita'),
      },
    },
  },
  {
    id: 'wiki-oscars',
    name: 'Wikipedia Vencedores do Oscar (Melhor Filme ao longo da história)',
    url: 'https://en.wikipedia.org/wiki/Academy_Award_for_Best_Picture',
    prompt: 'Extraia a lista de filmes com o título da obra premiada e o ano',
    description: 'Tabela histórica de prêmios da Academia de Cinema.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        film: text('film', 'filme', 'title', 'movie'),
        year: number('year', 'ano'),
      },
    },
  },
  {
    id: 'wiki-olympics',
    name: 'Wikipedia Quadro Histórico de Medalhas (Jogos Olímpicos)',
    url: 'https://en.wikipedia.org/wiki/All-time_Olympic_Games_medal_table',
    prompt: 'Extraia as nações com o nome do país e o total de medalhas de ouro',
    description: 'Quadro olímpico com dezenas de países e medalhas de ouro, prata e bronze.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        nation: text('nation', 'country', 'pais', 'name'),
        gold: number('gold', 'ouro', 'medals'),
      },
    },
  },
  {
    id: 'worldometers-pop',
    name: 'Worldometer Demografia (População dos países em tempo real)',
    url: 'https://www.worldometers.info/world-population/',
    prompt: 'Extraia os países com o nome do país e a população atual estimada',
    description: 'Portal líder em dados estatísticos e contadores populacionais globais.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US' },
    oracle: {
      minRecords: 15,
      fields: {
        country: text('country', 'pais', 'name'),
        population: text('population', 'populacao', 'people'),
      },
    },
  },
  {
    id: 'scrapethissite-countries',
    name: 'Countries of the World (Catálogo internacional de dados)',
    url: 'https://www.scrapethissite.com/pages/simple/',
    prompt: 'Extraia todos os países com o nome do país, a capital e a população',
    description: 'Página com dados mundiais estruturados em cards com classes semânticas.',
    tags: { siteType: 'public-data', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        country: text('country', 'pais', 'name', 'nation'),
        capital: text('capital'),
        population: number('population', 'populacao'),
      },
    },
  },
  {
    id: 'scrapethissite-hockey',
    name: 'Hockey Teams Stats (Tabela esportiva com paginação e porcentagens)',
    url: 'https://www.scrapethissite.com/pages/forms/',
    prompt: 'Extraia a tabela de times de hockey com o nome do time e o número de vitórias (wins)',
    description: 'Tabela densa de esportes com colunas numéricas de vitórias, derrotas e porcentagens.',
    tags: { siteType: 'sports', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: {
      minRecords: 20,
      fields: {
        team: text('team', 'time', 'name'),
        wins: number('wins', 'vitorias', 'win'),
      },
    },
  },

  // =========================================================================
  // 8. Esportes, Competições & Resultados
  // =========================================================================
  {
    id: 'globoesporte',
    name: 'Globo Esporte GE (Portal de cobertura esportiva líder BR)',
    url: 'https://ge.globo.com/',
    prompt: 'Extraia as principais notícias esportivas com título e link',
    description: 'Portal de alto tráfego com cobertura de futebol, Fórmula 1 e basquete.',
    tags: { siteType: 'sports', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'espn-br',
    name: 'ESPN Brasil (Cobertura esportiva e transmissões ao vivo)',
    url: 'https://www.espn.com.br/',
    prompt: 'Extraia as notícias de esportes com o título da matéria e o link',
    description: 'Portal do canal ESPN com análises esportivas e manchetes.',
    tags: { siteType: 'sports', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'lance',
    name: 'Lance! (Diário e portal de jornalismo esportivo BR)',
    url: 'https://www.lance.com.br/',
    prompt: 'Extraia as manchetes esportivas com título e link',
    description: 'Noticiário esportivo brasileiro em formato dinâmico.',
    tags: { siteType: 'sports', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 9. Finanças, Cripto & Mercados
  // =========================================================================
  {
    id: 'tradingview',
    name: 'TradingView Cripto (Painel de cotações em tempo real)',
    url: 'https://www.tradingview.com/markets/cryptocurrencies/prices-all/',
    prompt: 'Extraia a tabela com o nome da criptomoeda e o preço atual em dólares',
    description: 'Plataforma profissional de gráficos financeiros com tabela interativa.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 10, fields: { name: text('name', 'coin', 'moeda', 'ticker'), price: text('price', 'preco', 'valor', 'last') } },
  },
  {
    id: 'coingecko',
    name: 'CoinGecko (Monitor independente do mercado cripto)',
    url: 'https://www.coingecko.com/',
    prompt: 'Extraia as criptomoedas com o nome da moeda e o preço atual em dólares',
    description: 'Tabela de ativos digitais com market cap, volume e preços.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 10, fields: { name: text('name', 'coin', 'moeda'), price: text('price', 'preco', 'valor') } },
  },
  {
    id: 'folha-mercado',
    name: 'Folha de S.Paulo Mercado (Notícias de economia e finanças)',
    url: 'https://www1.folha.uol.com.br/mercado/',
    prompt: 'Extraia as notícias de mercado com título e link',
    description: 'Cobertura de macroeconomia, negócios e mercado financeiro.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'estadao-economia',
    name: 'Estadão Economia & Negócios (Portal financeiro tradicional)',
    url: 'https://www.estadao.com.br/economia/',
    prompt: 'Extraia as matérias de economia com o título e o link',
    description: 'Seção econômica do jornal O Estado de S. Paulo com notícias e cotações.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 10. E-Commerce, Catálogos de Produtos & SPAs
  // =========================================================================
  {
    id: 'quotes-js',
    name: 'Quotes to Scrape JS (SPA client-side render via Playwright)',
    url: 'https://quotes.toscrape.com/js/',
    prompt: 'Extraia todas as frases com o texto da citação e o nome do autor',
    description: 'Conteúdo renderizado 100% via JavaScript dinâmico no navegador.',
    tags: { siteType: 'catalog', render: 'csr-spa', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 10, fields: { text: text('text', 'quote', 'citacao'), author: text('author', 'autor') } },
  },
  {
    id: 'scrapethissite-ajax',
    name: 'Scrape This Site AJAX (SPA com chamadas assíncronas do Oscar)',
    url: 'https://www.scrapethissite.com/pages/ajax-javascript/',
    prompt: 'Extraia os filmes vencedores do Oscar com o título do filme e o ano da premiação',
    description: 'Página interativa com carregamento dinâmico via requisições assíncronas.',
    tags: { siteType: 'catalog', render: 'csr-spa', dataSource: 'dom', mode: 'collection', locale: 'en-US', protection: 'none' },
    oracle: { minRecords: 3, fields: { title: text('title', 'filme', 'name'), year: number('year', 'ano') } },
  },
  {
    id: 'books-travel',
    name: 'Books to Scrape Viagem (Catálogo multi-campo e estoque)',
    url: 'https://books.toscrape.com/catalogue/category/books/travel_2/index.html',
    prompt: 'Extraia os livros com o título da obra, o preço em libras e a disponibilidade em estoque',
    description: 'Catálogo com moeda estrangeira (£) e espaços em branco em tags de estoque.',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'dom', mode: 'collection', locale: 'en-GB', protection: 'none' },
    oracle: {
      minRecords: 10,
      fields: {
        title: text('title', 'titulo', 'name'),
        price: number('price', 'preco'),
        availability: text('availability', 'stock', 'estoque', 'disponibilidade'),
      },
    },
  },
  {
    id: 'consul',
    name: 'Consul Brasil (E-Commerce com Microdados Schema.org / JSON-LD)',
    url: 'https://www.consul.com.br/geladeira-frost-free-duplex-consul-crm44mb/p',
    prompt: 'Extraia o nome da geladeira e o preço em reais',
    description: 'Página de produto com schema.org/JSON-LD e preço em BRL.',
    tags: { siteType: 'ecommerce', render: 'ssr', dataSource: 'jsonld', mode: 'single', locale: 'pt-BR' },
    oracle: { maxRecords: 1, fields: { name: text('name', 'nome', 'title', 'product'), price: number('price', 'preco') } },
  },

  // =========================================================================
  // 11. Ciência, Inovação, Governo & Mídia Especializada (Novos Domínios)
  // =========================================================================
  {
    id: 'canaltech',
    name: 'Canaltech (Portal brasileiro de novidades em tecnologia)',
    url: 'https://canaltech.com.br/',
    prompt: 'Extraia as notícias com o título da matéria e o link',
    description: 'Portal de tecnologia de alto tráfego no Brasil.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'tecmundo',
    name: 'TecMundo (Mídia de eletrônicos, inovação e jogos)',
    url: 'https://www.tecmundo.com.br/',
    prompt: 'Extraia as principais matérias com título e link',
    description: 'Portal temático de hardware, tecnologia e games.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline (Hardware, placas de vídeo e tecnologia)',
    url: 'https://www.adrenaline.com.br/',
    prompt: 'Extraia as notícias com o título e o link',
    description: 'Comunidade e portal brasileiro de benchmarks de hardware e GPUs.',
    tags: { siteType: 'tech-news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'exame',
    name: 'Exame (Revista de negócios, economia e ESG)',
    url: 'https://exame.com/',
    prompt: 'Extraia as notícias de negócios com a manchete e o link',
    description: 'Mídia líder em economia, gestão e investimentos no Brasil.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'manchete'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'bloomberg-linea',
    name: 'Bloomberg Línea Brasil (Finanças e mercados latino-americanos)',
    url: 'https://www.bloomberglinea.com.br/',
    prompt: 'Extraia as notícias de mercado com título e link',
    description: 'Portal financeiro com foco em negócios na América Latina.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'infomoney',
    name: 'InfoMoney (Investimentos, ações e mercado financeiro)',
    url: 'https://www.infomoney.com.br/',
    prompt: 'Extraia as notícias financeiras com título e link',
    description: 'Portal de investimentos, cotações de ações e fundos.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'valor-economico',
    name: 'Valor Econômico (Diário de economia e negócios Globo)',
    url: 'https://valor.globo.com/',
    prompt: 'Extraia as notícias de economia com o título e o link',
    description: 'Principal jornal de economia e finanças corporativas do Brasil.',
    tags: { siteType: 'finance', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'jovempan',
    name: 'Jovem Pan News (Notícias e rádio de cobertura nacional)',
    url: 'https://jovempan.com.br/',
    prompt: 'Extraia as manchetes com o título da notícia e o link',
    description: 'Portal de notícias e radiodifusão jornalística brasileira.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'dados-gov',
    name: 'Portal Brasileiro de Dados Abertos (Governo Federal)',
    url: 'https://dados.gov.br/',
    prompt: 'Extraia os conjuntos de dados em destaque com o título e o link',
    description: 'Repositório de transparência e dados abertos do governo brasileiro.',
    tags: { siteType: 'public-data', render: 'ssr', mode: 'collection', locale: 'pt-BR' },
    oracle: { minRecords: 3, fields: { title: text('title', 'titulo', 'name'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'boxofficemojo',
    name: 'Box Office Mojo (Bilheteria de cinema IMDb)',
    url: 'https://www.boxofficemojo.com/',
    prompt: 'Extraia os filmes em cartaz com o título e o faturamento',
    description: 'Banco de dados oficial de bilheterias de cinema mantido pelo IMDb.',
    tags: { siteType: 'entertainment', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'movie', 'film', 'name'), gross: text('gross', 'weekend', 'revenue', 'money') } },
  },
  {
    id: 'hashnode',
    name: 'Hashnode (Plataforma global de blogs de tecnologia)',
    url: 'https://hashnode.com/',
    prompt: 'Extraia os artigos em destaque com o título da publicação e o link',
    description: 'Rede internacional de publicações de engenharia de software.',
    tags: { siteType: 'forum', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'theconversation',
    name: 'The Conversation (Artigos acadêmicos e jornalismo científico)',
    url: 'https://theconversation.com/',
    prompt: 'Extraia os artigos com o título da publicação e o link',
    description: 'Portal de divulgação de pesquisas científicas e análises universitárias.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'article'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'scientificamerican',
    name: 'Scientific American (Revista de ciência centenária)',
    url: 'https://www.scientificamerican.com/',
    prompt: 'Extraia as reportagens de ciência com título e link',
    description: 'Publicação de ciência e inovação mais antiga dos Estados Unidos.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'sciencedaily',
    name: 'ScienceDaily (Notícias de descobertas científicas e saúde)',
    url: 'https://www.sciencedaily.com/',
    prompt: 'Extraia os artigos de descobertas com o título e o link',
    description: 'Portal agregador de pesquisas acadêmicas e descobertas da saúde.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'space-news',
    name: 'Space.com (Astronomia, exploração espacial e astrofísica)',
    url: 'https://www.space.com/',
    prompt: 'Extraia as notícias de astronomia com o título e o link',
    description: 'Portal especializado em lançamentos de foguetes, astronomia e missões espaciais.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'article'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'gizmodo',
    name: 'Gizmodo (Ciência, cultura nerd, tecnologia e ficção)',
    url: 'https://gizmodo.com/',
    prompt: 'Extraia as matérias com o título da notícia e o link',
    description: 'Portal icônico de design, tecnologia de consumo e ficção científica.',
    tags: { siteType: 'tech-news', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },

  // =========================================================================
  // 13. Mídia Internacional Multilíngue, Mercados Globais & Dados Abertos
  // =========================================================================
  {
    id: 'elpais',
    name: 'El País América (Maior jornal em espanhol da Ibero-América)',
    url: 'https://elpais.com/america/',
    prompt: 'Extraia as notícias com título da manchete e link',
    description: 'Portal de notícias em língua espanhola com cobertura global e latino-americana.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'es-ES' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'titular'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'lemonde',
    name: 'Le Monde (Principal jornal diário da França)',
    url: 'https://www.lemonde.fr/',
    prompt: 'Extraia as notícias com o título da matéria e o link',
    description: 'Diário de referência em língua francesa com tipografia e caracteres latinos estendidos.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'fr-FR' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titre', 'headline'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'dw-espanol',
    name: 'Deutsche Welle Español (Emissora internacional alemã em espanhol)',
    url: 'https://www.dw.com/es/actualidad/s-30684',
    prompt: 'Extraia as reportagens com título e link',
    description: 'Portal internacional multilíngue em espanhol com reportagens e matérias de atualidades.',
    tags: { siteType: 'news', render: 'ssr', mode: 'collection', locale: 'es-ES' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'headline', 'titular'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'ecb-exchange-rates',
    name: 'Banco Central Europeu (Taxas de câmbio de referência do Euro)',
    url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    prompt: 'Extraia a tabela de moedas e taxas de câmbio com nome da moeda, código e cotação',
    description: 'Tabela tabular financeira oficial do Banco Central Europeu com cotações de moedas mundiais (USD, JPY, GBP, etc.).',
    tags: { siteType: 'tabular', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 10, fields: { currency: text('currency', 'moeda', 'code', 'codigo'), rate: number('rate', 'spot', 'cotacao', 'taxa', 'value') } },
  },
  {
    id: 'mercadolibre-ar',
    name: 'Mercado Libre Argentina (E-commerce líder na América do Sul Hispânica)',
    url: 'https://listado.mercadolibre.com.ar/libros',
    prompt: 'Extraia os livros com título, preço e link',
    description: 'Catálogo de e-commerce com paginação e formatação de preços em pesos argentinos ($).',
    tags: { siteType: 'ecommerce', render: 'hybrid', mode: 'collection', locale: 'es-AR', protection: 'cloudflare' },
    oracle: { minRecords: 5, fields: { title: text('title', 'titulo', 'name', 'nombre'), price: number('price', 'preco', 'precio'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera English (Notícias internacionais e Oriente Médio)',
    url: 'https://www.aljazeera.com/',
    prompt: 'Extraia as notícias com título e link',
    description: 'Emissora global de jornalismo com foco no Sul Global e Oriente Médio.',
    tags: { siteType: 'news', render: 'hybrid', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 5, fields: { title: text('title', 'headline', 'story'), link: url('link', 'url', 'href') } },
  },
  {
    id: 'data-gov',
    name: 'Data.gov (Portal oficial de dados abertos do governo dos EUA)',
    url: 'https://data.gov/',
    prompt: 'Extraia as seções ou destaques de dados abertos com título e link',
    description: 'Portal federal de catálogo de dados abertos do governo norte-americano.',
    tags: { siteType: 'corporate', render: 'ssr', mode: 'collection', locale: 'en-US' },
    oracle: { minRecords: 3, fields: { title: text('title', 'name', 'headline'), link: url('link', 'url', 'href') } },
  },
];

class SimpleLeaseStore implements ILeaseStore {
  readonly held = new Map<string, AbortController>();
  async tryAcquire(key: string): Promise<ResourceLease | null> {
    if (this.held.has(key)) return null;
    const controller = new AbortController();
    this.held.set(key, controller);
    return {
      signal: controller.signal,
      assertOwned: async () => { },
      release: async () => {
        this.held.delete(key);
      },
    };
  }
}

async function main() {
  const options = parseEvalArgs(process.argv.slice(2));
  // Must happen before any module that validates the environment is imported.
  applyProviderOverride(options);

  const [
    { ConfigurationPipeline },
    { createConfigurationModel },
    { createCompilerProvider },
    { composeExtraction },
    { createHttpCandidates },
    { BrowserCapacity },
    { CountingModelProvider },
    { runEvalSuite },
    { evaluatePipelineResult },
    { checkInvariants },
    { classifyEvalError },
  ] = await Promise.all([
    import('../src/extraction/configuration.js'),
    import('../src/extraction/configurationModel.js'),
    import('../src/providers/compilers/compiler.factory.js'),
    import('../src/extraction/composition.js'),
    import('../src/providers/scraping/scraper.factory.js'),
    import('../src/resources/browserCapacity.js'),
    import('../src/extraction/configurationEvaluation.js'),
    import('../src/evals/runner.js'),
    import('../src/evals/pipelineExecution.js'),
    import('../src/evals/oracle.js'),
    import('../src/evals/outcomes.js'),
  ]);

  const extraction = composeExtraction(
    createHttpCandidates(),
    new BrowserCapacity(new SimpleLeaseStore(), 2)
  );
  const modelProvider = createCompilerProvider(
    options.provider as 'agy' | 'codex' | 'api' | undefined,
    options.model ? { model: options.model } : undefined
  );

  const report = await runEvalSuite({
    suite: 'live-web',
    tier: 'T3',
    cases: selectEvalCases(liveBenchmarkSuite, options),
    options,
    delayMs: 1500,
    execute: async (site, run) => {
      const counted = new CountingModelProvider(modelProvider);
      const pipeline = new ConfigurationPipeline(
        createConfigurationModel(counted),
        extraction.discovery,
        extraction.executor,
        {
          budgetMs: 300000,
          maxAttempts: 3,
          maxDecisions: 10,
          reviewReserveMs: 5000,
          evidenceLimit: 30000,
          semanticEnabled: true,
          semanticThreshold: 4,
        }
      );
      try {
        const result = await pipeline.configure({
          jobId: `live-${site.id}-${run}`,
          url: site.url,
          prompt: site.prompt,
        });
        return evaluatePipelineResult(
          result,
          (records) => checkInvariants(records, site.oracle),
          counted.totalCalls
        );
      } catch (error) {
        return { ...classifyEvalError(error), records: 0, modelCalls: counted.totalCalls };
      }
    },
  });

  if (report.summary.overall.passed < report.summary.overall.scored) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Erro fatal no benchmark ao vivo:', error);
  process.exit(1);
});
