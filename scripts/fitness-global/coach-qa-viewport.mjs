// Model the visual viewport independently of the layout viewport. This measures
// application geometry around a simulated keyboard, without emulating iOS chrome.
export function simulateViewport() {
  const visualViewport = new EventTarget();
  Object.defineProperty(window, 'visualViewport', { value: visualViewport, configurable: true });
  window.simulateCoachViewport = ({ reduction = 0, offsetTop = 0, scale = 1, keyboard = false } = {}) => {
    const height = Math.round((innerHeight - reduction) / scale);
    Object.assign(visualViewport, { height, width: innerWidth / scale, offsetTop, offsetLeft: 0, scale });
    let panel = document.querySelector('#simulated-coach-keyboard');
    if (keyboard && !panel) {
      panel = document.createElement('div');
      panel.id = 'simulated-coach-keyboard';
      panel.textContent = 'Teclado táctil simulado';
      Object.assign(panel.style, {
        position: 'fixed', inset: 'auto 0 0', zIndex: '9999', background: '#313539',
        color: '#fff', borderTop: '1px dashed #c2c7ca', padding: '12px', textAlign: 'center',
      });
      document.body.append(panel);
    }
    if (panel) {
      panel.style.height = innerHeight - height - offsetTop + 'px';
      panel.hidden = !keyboard;
    }
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  };
  window.simulateCoachViewport();
}
