import path from 'node:path'
export default function () {
  const svgImports = { name: 'svg-imports', setup(build) { build.onResolve({ filter: /\.svg\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)) })) } }
  return { loader: { '.css': 'text', '.svg': 'text' }, plugins: [svgImports], backendOptions: { loader: { '.svg': 'text' }, plugins: [svgImports] } }
}
