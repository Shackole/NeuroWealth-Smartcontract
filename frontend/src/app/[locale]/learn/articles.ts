import type { ElementType } from 'react';
import { TrendingUp, Layers, RefreshCw, DollarSign, Zap } from 'lucide-react';

interface GlossaryEntry {
  slug: string;
  dashboardLink: { href: string; label: string };
  term: string;
  icon: ElementType;
  iconColor: string;
  summary: string;
  detail: string;
}

export const ARTICLES: GlossaryEntry[] = [
  {
    slug: 'apy',
    dashboardLink: { href: '/dashboard#chart-heading', label: 'View current APY on the dashboard' },
    term: 'APY — Annual Percentage Yield',
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    summary: 'How much your money grows in one year, expressed as a percentage.',
    detail:
      'APY (Annual Percentage Yield) is the real return you earn over a year including the effect of compounding. Compounding means your earnings themselves earn interest. For example, 8% APY on 1,000 USDC means you would have roughly 1,080 USDC after one year — even if the rate was only applied daily and the daily earnings were added back to your balance.',
  },
  {
    slug: 'shares',
    dashboardLink: { href: '/dashboard#portfolio-summary-heading', label: 'View your share balance on the dashboard' },
    term: 'Shares',
    icon: DollarSign,
    iconColor: 'text-indigo-400',
    summary: 'Your ownership record inside the NeuroWealth vault.',
    detail:
      'When you deposit USDC, the smart contract mints "shares" that represent your portion of the total vault. As the vault earns yield, each share becomes worth slightly more USDC. When you withdraw, your shares are burned and you receive back USDC. You never hold shares directly in your wallet — they live inside the Soroban contract.',
  },
  {
    slug: 'exchange-rate',
    dashboardLink: { href: '/stats', label: 'View the vault exchange-rate chart' },
    term: 'Exchange Rate',
    icon: RefreshCw,
    iconColor: 'text-amber-400',
    summary: 'How many USDC one share is currently worth.',
    detail:
      'The exchange rate starts at 1.0 (1 share = 1 USDC) and rises over time as yield accumulates in the vault. If the exchange rate is 1.05, each share is worth 1.05 USDC. The rate only ever increases — it never drops from earned yield, though unexpected protocol losses could theoretically reduce it.',
  },
  {
    slug: 'rebalancing',
    dashboardLink: { href: '/dashboard#history-heading', label: 'View rebalance activity on the dashboard' },
    term: 'Rebalancing',
    icon: Zap,
    iconColor: 'text-emerald-400',
    summary: 'When the AI moves your funds to a better-yielding protocol.',
    detail:
      'The AI agent checks available yield rates across all integrated protocols every hour. If a different protocol offers more than 0.5% higher APY, it calls the vault\'s rebalance function to move the pooled funds. This is fully automated — you do not need to approve each rebalance. The vault enforces a cooldown between rebalances to prevent excessive activity.',
  },
  {
    slug: 'blend',
    dashboardLink: { href: '/dashboard#strategy-comparison', label: 'Compare strategies on the dashboard' },
    term: 'Blend Protocol',
    icon: Layers,
    iconColor: 'text-blue-400',
    summary: 'A decentralised lending protocol on the Stellar network.',
    detail:
      'Blend is a lending protocol built with Soroban smart contracts on Stellar. Depositors supply USDC that borrowers can borrow by posting collateral. Lenders earn interest paid by borrowers. NeuroWealth\'s Conservative and Balanced strategies use Blend as the primary yield source. Learn more at blendprotocol.org.',
  },
  {
    slug: 'stellar-dex',
    dashboardLink: { href: '/dashboard#strategy-comparison', label: 'Compare strategies on the dashboard' },
    term: 'DEX — Decentralised Exchange',
    icon: RefreshCw,
    iconColor: 'text-purple-400',
    summary: 'A trading exchange that runs on-chain with no central operator.',
    detail:
      'Stellar has a built-in DEX where anyone can trade assets without a central company in the middle. Liquidity providers (LPs) deposit pairs of assets into a pool; traders swap through those pools and pay a fee. LPs earn a share of those fees. The Balanced and Growth strategies may deploy funds into Stellar DEX liquidity pools to capture trading fees as an additional yield source.',
  },
];

type ArticleTranslation = Pick<GlossaryEntry, 'term' | 'summary' | 'detail'>;
type LearnLabels = {
  index: string;
  glossary: string;
  dashboard: string;
  previous: string;
  next: string;
};

const labels: Record<string, LearnLabels | undefined> = {
  en: { index: 'Learn DeFi Basics', glossary: 'Glossary', dashboard: 'Back to Dashboard', previous: 'Previous article', next: 'Next article' },
  es: { index: 'Conceptos básicos de DeFi', glossary: 'Glosario', dashboard: 'Volver al panel', previous: 'Artículo anterior', next: 'Artículo siguiente' },
  fr: { index: 'Les bases de la DeFi', glossary: 'Glossaire', dashboard: 'Retour au tableau de bord', previous: 'Article précédent', next: 'Article suivant' },
  pt: { index: 'Conceitos básicos de DeFi', glossary: 'Glossário', dashboard: 'Voltar ao painel', previous: 'Artigo anterior', next: 'Próximo artigo' },
  zh: { index: '了解 DeFi 基础知识', glossary: '术语表', dashboard: '返回仪表板', previous: '上一篇', next: '下一篇' },
  ja: { index: 'DeFi の基礎を学ぶ', glossary: '用語集', dashboard: 'ダッシュボードに戻る', previous: '前の記事', next: '次の記事' },
};

const translations: Record<string, Record<string, ArticleTranslation> | undefined> = {
  es: {
    "apy": {
      term: "APY — Rendimiento porcentual anual",
      summary: "Cuánto crece tu dinero en un año.",
      detail: "El APY incluye el interés compuesto. Con un APY del 8 %, 1.000 USDC serían aproximadamente 1.080 USDC después de un año.",
    },
    "shares": {
      term: "Participaciones",
      summary: "Representan tu parte de la bóveda.",
      detail: "El contrato emite participaciones cuando depositas USDC y las quema cuando retiras fondos. Su valor en USDC depende del tipo de cambio de la bóveda.",
    },
    "exchange-rate": {
      term: "Tipo de cambio",
      summary: "Indica cuántos USDC vale una participación.",
      detail: "Con un tipo de cambio de 1,05, una participación vale 1,05 USDC. El valor puede cambiar con el rendimiento de la bóveda.",
    },
    "rebalancing": {
      term: "Reequilibrio",
      summary: "Redistribuye los fondos entre protocolos.",
      detail: "El agente compara los rendimientos disponibles y puede mover los fondos agrupados cuando encuentra una oportunidad elegible.",
    },
    "blend": {
      term: "Protocolo Blend",
      summary: "Un protocolo de préstamos en Stellar.",
      detail: "Los proveedores aportan USDC y pueden recibir intereses de los prestatarios, que depositan garantías.",
    },
    "stellar-dex": {
      term: "DEX — Intercambio descentralizado",
      summary: "Permite intercambiar activos en la cadena.",
      detail: "Los operadores pueden intercambiar activos mediante fondos de liquidez. Los proveedores de liquidez reciben parte de las comisiones.",
    },
  },
  fr: {
    "apy": {
      term: "APY — Rendement annuel en pourcentage",
      summary: "La croissance de votre épargne sur un an.",
      detail: "L’APY tient compte des intérêts composés. À 8 % d’APY, 1 000 USDC représenteraient environ 1 080 USDC après un an.",
    },
    "shares": {
      term: "Parts",
      summary: "Elles représentent votre portion du coffre.",
      detail: "Le contrat émet des parts lors d’un dépôt et les détruit lors d’un retrait. Leur valeur en USDC dépend du taux de conversion du coffre.",
    },
    "exchange-rate": {
      term: "Taux de conversion",
      summary: "La valeur d’une part en USDC.",
      detail: "Avec un taux de 1,05, une part vaut 1,05 USDC. Cette valeur peut évoluer selon le rendement du coffre.",
    },
    "rebalancing": {
      term: "Rééquilibrage",
      summary: "La redistribution des fonds entre protocoles.",
      detail: "L’agent compare les rendements et peut déplacer les fonds mutualisés lorsqu’une occasion répond à ses critères.",
    },
    "blend": {
      term: "Protocole Blend",
      summary: "Un protocole de prêt sur Stellar.",
      detail: "Les fournisseurs déposent des USDC et peuvent percevoir les intérêts payés par les emprunteurs, qui apportent une garantie.",
    },
    "stellar-dex": {
      term: "DEX — Échange décentralisé",
      summary: "Un moyen d’échanger des actifs sur la blockchain.",
      detail: "Les utilisateurs peuvent échanger des actifs via des pools de liquidité. Les fournisseurs de liquidité perçoivent une part des frais.",
    },
  },
  pt: {
    "apy": {
      term: "APY — Rendimento percentual anual",
      summary: "Quanto seu dinheiro rende em um ano.",
      detail: "O APY inclui os juros compostos. Com um APY de 8%, 1.000 USDC valeriam aproximadamente 1.080 USDC após um ano.",
    },
    "shares": {
      term: "Cotas",
      summary: "Representam sua participação no cofre.",
      detail: "O contrato emite cotas ao receber um depósito e as queima no saque. O valor em USDC depende da taxa de conversão do cofre.",
    },
    "exchange-rate": {
      term: "Taxa de conversão",
      summary: "O valor de uma cota em USDC.",
      detail: "Com uma taxa de 1,05, uma cota vale 1,05 USDC. Esse valor pode mudar com o rendimento do cofre.",
    },
    "rebalancing": {
      term: "Rebalanceamento",
      summary: "Redistribui fundos entre protocolos.",
      detail: "O agente compara os rendimentos e pode mover os fundos agrupados ao encontrar uma oportunidade que atenda aos critérios.",
    },
    "blend": {
      term: "Protocolo Blend",
      summary: "Um protocolo de empréstimos na Stellar.",
      detail: "Os fornecedores depositam USDC e podem receber juros de mutuários, que fornecem garantias.",
    },
    "stellar-dex": {
      term: "DEX — Corretora descentralizada",
      summary: "Permite trocar ativos na blockchain.",
      detail: "Os usuários podem trocar ativos em pools de liquidez. Os fornecedores de liquidez recebem parte das taxas.",
    },
  },
  zh: {
    "apy": {
      term: "APY（年化收益率）",
      summary: "衡量资金一年内的增长幅度。",
      detail: "APY 包含复利。若 APY 为 8%，1,000 USDC 一年后约为 1,080 USDC。",
    },
    "shares": {
      term: "份额",
      summary: "代表你在金库中所占的比例。",
      detail: "存入 USDC 时，合约会铸造份额，提款时则会销毁份额。份额的 USDC 价值取决于金库的兑换率。",
    },
    "exchange-rate": {
      term: "兑换率",
      summary: "表示每份额价值多少 USDC。",
      detail: "当兑换率为 1.05 时，每份额价值 1.05 USDC。该数值可能随金库收益而变化。",
    },
    "rebalancing": {
      term: "再平衡",
      summary: "在协议之间重新分配资金。",
      detail: "代理比较可用收益率，并可在机会满足条件时转移汇集的资金。",
    },
    "blend": {
      term: "Blend 协议",
      summary: "Stellar 上的借贷协议。",
      detail: "资金提供者存入 USDC，可以获得由提供抵押品的借款人支付的利息。",
    },
    "stellar-dex": {
      term: "DEX（去中心化交易所）",
      summary: "支持在链上交换资产。",
      detail: "交易者可以通过流动性池交换资产，流动性提供者可获得部分交易手续费。",
    },
  },
  ja: {
    "apy": {
      term: "APY（年間利回り）",
      summary: "資金が1年間でどれだけ増えるかを示します。",
      detail: "APY には複利が含まれます。APY が8%の場合、1,000 USDC は1年後におよそ1,080 USDC になります。",
    },
    "shares": {
      term: "持分",
      summary: "金庫に対するあなたの取り分です。",
      detail: "USDC を預け入れるとコントラクトが持分を発行し、引き出すと持分を消却します。USDC での価値は金庫の換算レートによって決まります。",
    },
    "exchange-rate": {
      term: "換算レート",
      summary: "持分1口あたりの USDC 価値です。",
      detail: "換算レートが1.05の場合、1口は1.05 USDC に相当します。この値は金庫の運用成績によって変動します。",
    },
    "rebalancing": {
      term: "リバランス",
      summary: "プロトコル間で資金を再配分します。",
      detail: "エージェントは利回りを比較し、条件を満たす機会があれば、まとめられた資金を移動できます。",
    },
    "blend": {
      term: "Blend プロトコル",
      summary: "Stellar 上の融資プロトコルです。",
      detail: "資金提供者は USDC を預け入れ、担保を差し入れた借り手から利息を受け取ることができます。",
    },
    "stellar-dex": {
      term: "DEX（分散型取引所）",
      summary: "ブロックチェーン上で資産を交換できます。",
      detail: "利用者は流動性プールを通じて資産を交換し、流動性提供者は手数料の一部を受け取ります。",
    },
  },
};

export function getLearnLabels(locale: string) {
  return Object.prototype.hasOwnProperty.call(labels, locale) ? labels[locale] : undefined;
}

export function getLearnArticles(locale: string) {
  if (!getLearnLabels(locale)) return [];
  if (locale === 'en') return ARTICLES;
  return ARTICLES.flatMap((article) => {
    const translation = translations[locale]?.[article.slug];
    return translation ? [{ ...article, ...translation }] : [];
  });
}

export function getLearnArticle(locale: string, slug: string) {
  const articles = getLearnArticles(locale);
  const index = articles.findIndex((article) => article.slug === slug);
  if (index === -1) return undefined;
  return {
    article: articles[index],
    previous: articles[index - 1],
    next: articles[index + 1],
  };
}
