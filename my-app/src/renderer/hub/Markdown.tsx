import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

export function Markdown({
  source,
  variant = 'default',
}: {
  source: string;
  variant?: 'default' | 'compact';
}): React.ReactElement {
  return (
    <div className={`md${variant === 'compact' ? ' md--compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
