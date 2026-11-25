// Keep the mobile shell attached to the space still visible above the keyboard.
export function followCoachViewport(shell: HTMLElement) {
  const browser = shell.ownerDocument.defaultView;
  if (!browser) return;
  const mobile = browser.matchMedia('(max-width: 767px)');
  const touch = browser.matchMedia('(any-pointer: coarse)');
  const viewport = browser.visualViewport;
  let layoutWidth = browser.innerWidth;
  let maxViewportHeight = 0;

  const clear = () => {
    shell.style.removeProperty('--coach-viewport-height');
    shell.style.removeProperty('--coach-viewport-top');
    delete shell.dataset.coachKeyboard;
  };

  const resize = () => {
    if (!mobile.matches) {
      maxViewportHeight = 0;
      clear();
      return;
    }

    const height = viewport?.height ?? browser.innerHeight;
    shell.style.setProperty('--coach-viewport-height', `${height}px`);
    shell.style.setProperty('--coach-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    if (layoutWidth !== browser.innerWidth) {
      layoutWidth = browser.innerWidth;
      maxViewportHeight = 0;
    }
    const unzoomed = viewport && Math.abs(viewport.scale - 1) < 0.02 &&
      Math.abs(viewport.width - layoutWidth) < 2;
    if (unzoomed) maxViewportHeight = Math.max(maxViewportHeight, height);
    const editorFocused = shell.ownerDocument.activeElement?.matches('.chat-composer .chat-textarea') ?? false;
    // Browser toolbars account for small height changes. Once open, wait for
    // viewport recovery before restoring the bar, including during blur.
    if (touch.matches && unzoomed && maxViewportHeight - height >= 140 &&
        (editorFocused || shell.dataset.coachKeyboard === 'open')) {
      shell.dataset.coachKeyboard = 'open';
    } else {
      delete shell.dataset.coachKeyboard;
    }
  };
  resize();
  viewport?.addEventListener('resize', resize);
  viewport?.addEventListener('scroll', resize);
  browser.addEventListener('resize', resize);
  mobile.addEventListener('change', resize);
  touch.addEventListener('change', resize);
  shell.addEventListener('focusin', resize);
  return () => {
    viewport?.removeEventListener('resize', resize);
    viewport?.removeEventListener('scroll', resize);
    browser.removeEventListener('resize', resize);
    mobile.removeEventListener('change', resize);
    touch.removeEventListener('change', resize);
    shell.removeEventListener('focusin', resize);
    clear();
  };
}
