export async function dynamicImport<T = any>(specifier: string): Promise<T> {
  // Use `new Function` so TypeScript won't downlevel `import()` to `require()`.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('s', 'return import(s)')(specifier) as Promise<T>;
}
