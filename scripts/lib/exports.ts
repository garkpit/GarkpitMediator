// What the library exports, read from the source with the TypeScript compiler, so the API reference
// and the cheat sheet can be checked against the code and not against anyone's memory.
import { join } from 'node:path';
import ts from 'typescript';
import { REPO } from './manifest';

export interface ExportedName {
  name: string;
  /** True for interfaces and type aliases, which exist only at compile time. */
  typeOnly: boolean;
}

export function exportsOf(entry: 'index' | 'http'): ExportedName[] {
  const file = join(REPO, 'src', `${entry}.ts`);
  const program = ts.createProgram([file], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true, noEmit: true, types: [] });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`Could not read the exports of ${file}.`);
  return checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return { name: symbol.getName(), typeOnly: (target.flags & ts.SymbolFlags.Value) === 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The subpath entry points package.json declares, e.g. "./http". */
export async function packageSubpaths(): Promise<string[]> {
  const pkg = (await Bun.file(join(REPO, 'package.json')).json()) as { exports: Record<string, unknown> };
  return Object.keys(pkg.exports).filter((key) => key !== '.');
}
