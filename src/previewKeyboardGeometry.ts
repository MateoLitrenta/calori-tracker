// Loaded only in an opted-in Preview. Samples live in this tab until reload.
export function captureKeyboardGeometry(version: string) {
  const samples: object[] = [];
  const rect = (element?: Element | null) => {
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x, y, width, height].map(Math.round);
  };
  const capture = (event: Event) => {
    const sheet = document.querySelector('.entry-bottom-sheet:has(form.entry-form)');
    if (!sheet) return;
    const body = sheet.querySelector('.entry-form-content');
    const field = sheet.contains(document.activeElement) ? document.activeElement : null;
    const vv = window.visualViewport;
    const fieldId = field?.id ?? '';
    samples.push({
      t: Math.round(performance.now()), event: event.type, source: event.currentTarget === vv ? 'viewport' : event.currentTarget === window ? 'window' : 'document',
      field: /^(add|edit)-(meal|workout)-(description|calories|activity|notes|time|duration|distance|pace|type)$/.test(fieldId) ? fieldId : field?.tagName,
      windowY: window.scrollY, layout: [window.innerWidth, window.innerHeight],
      visual: vv && { height: vv.height, width: vv.width, pageTop: vv.pageTop, offsetTop: vv.offsetTop, scale: vv.scale },
      backdrop: rect(sheet.parentElement), sheet: rect(sheet), actions: rect(sheet.querySelector('.entry-form-footer')),
      body: rect(body), control: rect(field), internalScroll: body?.scrollTop,
    });
    if (samples.length > 800) samples.shift();
  };
  for (const type of ['input', 'focusin', 'focusout', 'selectionchange', 'scroll']) document.addEventListener(type, capture, true);
  for (const type of ['scroll', 'resize']) {
    window.addEventListener(type, capture);
    window.visualViewport?.addEventListener(type, capture);
  }
  window.addEventListener('calori-reset-geometry', () => { samples.length = 0; });
  window.addEventListener('calori-export-geometry', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version, samples }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'calori-teclado-' + version.slice(0, 8) + '.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}
