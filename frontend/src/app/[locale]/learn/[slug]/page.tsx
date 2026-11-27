import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLearnArticle, getLearnLabels } from '../articles';

type ArticlePageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const entry = getLearnArticle(locale, slug);
  if (!entry) notFound();
  return { title: `${entry.article.term} | NeuroWealth`, description: entry.article.summary };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale, slug } = await params;
  const labels = getLearnLabels(locale);
  const entry = getLearnArticle(locale, slug);
  if (!entry || !labels) notFound();

  const { article, previous, next } = entry;
  const indexHref = `/${locale}/learn`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
      <Link href={indexHref} className="text-sm text-emerald-400 hover:underline">
        {labels.index}
      </Link>
      <article className="glass-panel my-8 space-y-4 rounded-2xl p-6">
        <h1 className="text-3xl font-bold">{article.term}</h1>
        <p className="font-medium text-emerald-400">{article.summary}</p>
        <p className="leading-relaxed text-slate-300">{article.detail}</p>
      </article>
      <nav aria-label={labels.index} className="grid grid-cols-2 gap-4 text-sm text-emerald-400">
        {previous && (
          <Link rel="prev" href={`${indexHref}/${previous.slug}`} className="col-start-1 row-start-1 hover:underline">
            <span className="block text-slate-400">{labels.previous}</span>
            {previous.term}
          </Link>
        )}
        {next && (
          <Link rel="next" href={`${indexHref}/${next.slug}`} className="col-start-2 row-start-1 text-right hover:underline">
            <span className="block text-slate-400">{labels.next}</span>
            {next.term}
          </Link>
        )}
      </nav>
    </main>
  );
}
