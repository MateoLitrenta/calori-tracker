// The shared harness mounts product views with isolated synthetic services.
if (!process.argv.includes('--stage1')) process.argv.push('--stage1');
await import('../home-mobile/serve-qa.mjs');
