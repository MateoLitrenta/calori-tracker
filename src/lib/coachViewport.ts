export function getFocusedCoachProposalField(shell: HTMLElement): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const field = shell.ownerDocument.activeElement;
  const proposal = field?.closest('.chat-proposal-edit');
  if (!field || !proposal || !shell.contains(proposal) || !shell.contains(field) ||
      !field.matches('input, textarea, select') || field.matches(':disabled, [readonly]')) return null;
  if (field.tagName === 'INPUT' && /^(checkbox|radio|file|button|submit|reset|hidden)$/.test((field as HTMLInputElement).type)) return null;
  return field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

// Keep the mobile shell attached to the space still visible above the keyboard.
export function followCoachViewport(shell: HTMLElement) {
  const browser = shell.ownerDocument.defaultView;
  if (!browser) return;
  const mobile = browser.matchMedia('(max-width: 767px)');
  const touch = browser.matchMedia('(any-pointer: coarse)');
  const viewport = browser.visualViewport;
  let layoutWidth = browser.innerWidth;
  let maxViewportHeight = 0;
  let keyboardOpen = false;
  let keyboardOwner: 'proposal' | 'composer' | undefined;

  const clear = () => {
    shell.style.removeProperty('--coach-viewport-height');
    shell.style.removeProperty('--coach-viewport-top');
    delete shell.dataset.coachKeyboard;
    delete shell.dataset.coachKeyboardOwner;
  };

  const resize = () => {
    const width = browser.innerWidth;
    const height = viewport?.height ?? browser.innerHeight;
    const atNormalScale = viewport && Math.abs(viewport.scale - 1) < 0.02;

    if (!touch.matches) {
      keyboardOpen = false;
      keyboardOwner = undefined;
    } else if (atNormalScale && Math.abs(viewport.width - width) < 2) {
      // Layout and visual resize events can arrive separately on rotation.
      // While the keyboard is open, use the new layout height as the reference.
      if (layoutWidth !== width) {
        layoutWidth = width;
        maxViewportHeight = keyboardOpen ? browser.innerHeight : 0;
      }
      maxViewportHeight = Math.max(maxViewportHeight, height);
      const focused = shell.ownerDocument.activeElement;
      const focusedOwner = getFocusedCoachProposalField(shell) ? 'proposal'
        : focused && shell.contains(focused) && focused.matches('.chat-composer .chat-textarea:not(:disabled):not([readonly])') ? 'composer'
          : undefined;
      // Small height changes can come from browser bars. Keep the keyboard
      // state during blur and clear it when the visible area recovers.
      keyboardOpen = (keyboardOpen || !!focusedOwner) && maxViewportHeight - height >= 140;
      // An action can take focus before its click. Retain the editing layout
      // until the keyboard closes so the action does not move under the pointer.
      keyboardOwner = keyboardOpen ? focusedOwner ?? keyboardOwner : undefined;
    }

    const showKeyboardLayout = atNormalScale && keyboardOpen;
    if (!mobile.matches && !showKeyboardLayout) {
      clear();
      return;
    }
    shell.style.setProperty('--coach-viewport-height', `${height}px`);
    shell.style.setProperty('--coach-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    if (showKeyboardLayout) {
      shell.dataset.coachKeyboard = 'open';
      if (keyboardOwner) shell.dataset.coachKeyboardOwner = keyboardOwner;
    } else {
      delete shell.dataset.coachKeyboard;
      delete shell.dataset.coachKeyboardOwner;
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
