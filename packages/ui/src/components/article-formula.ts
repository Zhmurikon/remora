import katex from 'katex';
import 'katex/dist/katex.min.css';

export function articleFormula(value: string, display: boolean) {
  return katex.renderToString(value, {
    displayMode: display,
    output: 'htmlAndMathml',
    strict: 'ignore',
    throwOnError: false,
    trust: false,
  });
}
