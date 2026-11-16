import type { ReactNode } from 'react';

type ArticleJacketProps = {
  title: string;
  category: string;
  children: ReactNode;
};

export function ArticleJacket({ title, category, children }: ArticleJacketProps) {
  const separator = title.indexOf(': ');
  return (
    <header className="article-jacket">
      <div className="article-jacket-media">{children}</div>
      <div className="article-sheet">
        <div className="article-sheet-face">
          <span className="article-category">{category}</span>
          <h1>
            {separator < 0 ? (
              title
            ) : (
              <>
                {title.slice(0, separator + 2)}
                <em>{title.slice(separator + 2)}</em>
              </>
            )}
          </h1>
        </div>
      </div>
    </header>
  );
}
