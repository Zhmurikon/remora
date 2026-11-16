/* global document, location, URLSearchParams, setTimeout, clearTimeout, getComputedStyle */
'use strict';

// Разметка SVG общая; каждой кнопке нужен свой id маски, чтобы росчерки были независимыми.
globalThis.SheetButton = (() => {
  let sequence = 0;
  const frozen =
    document.querySelector('[data-sheet-preview]') &&
    new URLSearchParams(location.search).get('state') === 'preview';
  const template = document.createElement('template');
  template.innerHTML = `<svg class="sheet-stroke" aria-hidden="true" focusable="false">
    <defs><mask maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
      <svg width="100%" height="100%" viewBox="0 0 220 48" preserveAspectRatio="none">
        <path class="sheet-line" pathLength="1" d="M-10 7L230 -3L-10 20L230 9L-10 32L230 21L-10 44L230 33L-10 57L230 45"/>
      </svg>
    </mask></defs>
    <g><rect class="sheet-color" width="100%" height="100%"/><foreignObject width="100%" height="100%">
      <div class="sheet-highlight"></div>
    </foreignObject></g></svg>`;

  function syncLabel(control) {
    const label = control.querySelector('.sheet-label');
    control.querySelector('.sheet-highlight').replaceChildren(label.cloneNode(true));
  }
  function setText(control, text) {
    control.querySelector('.sheet-label').textContent = text;
    syncLabel(control);
  }
  function attach(control) {
    const label = document.createElement('span');
    label.className = 'sheet-label';
    label.append(...control.childNodes);
    const ink = template.content.cloneNode(true);
    const maskId = 'sheet-ink-' + ++sequence;
    ink.querySelector('mask').id = maskId;
    ink.querySelector('g').setAttribute('mask', 'url(#' + maskId + ')');
    control.append(label, ink);
    syncLabel(control);

    // Вся зона загрузки принимает файл, в том числе при фокусе на прозрачном input.
    const trigger = control.closest('.dropzone') || control;
    let hovering = false;
    let release;
    function syncInk() {
      const focus = trigger.matches(':focus-visible') || trigger.querySelector(':focus-visible');
      control.classList.toggle('inked', Boolean(hovering || focus));
    }
    // Надпись под маской повторяет актуальную раскладку кнопки, включая мобильные отступы.
    function alignHighlight() {
      const style = getComputedStyle(control);
      const highlight = control.querySelector('.sheet-highlight');
      const flex = style.display.includes('flex');
      highlight.style.padding = style.padding;
      highlight.style.gap = style.gap;
      highlight.style.alignItems = flex ? style.alignItems : 'center';
      highlight.style.justifyContent = flex ? style.justifyContent : 'center';
      highlight.firstElementChild.style.display = flex ? 'contents' : 'block';
    }
    function replay() {
      if (control.disabled) return;
      alignHighlight();
      control.classList.remove('frozen');
      control.classList.add('inked');
      for (const animation of control.querySelector('.sheet-line').getAnimations())
        animation.currentTime = 0;
    }
    trigger.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hovering = true;
      replay();
    });
    trigger.addEventListener('pointerleave', () => {
      hovering = false;
      syncInk();
    });
    trigger.addEventListener('focusin', (event) => {
      if (event.target.matches(':focus-visible')) replay();
    });
    trigger.addEventListener('focusout', () => {
      if (!hovering) control.classList.remove('inked');
    });
    trigger.addEventListener('click', () => {
      replay();
      clearTimeout(release);
      release = setTimeout(syncInk, 850);
    });
    if (frozen) {
      alignHighlight();
      control.classList.add('inked', 'frozen');
    }
    return control;
  }

  document.querySelectorAll('[data-sheet]').forEach(attach);
  return { attach, setText };
})();
