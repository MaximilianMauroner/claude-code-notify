import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  target: 'node16',
  platform: 'node',
  sourcemap: false,
  minify: false,
  packages: 'external',
});

console.log('Server build complete');
