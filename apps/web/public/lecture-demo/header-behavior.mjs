/* global document, window */
export function bindMenu(header, signal) {
  const menuToggle = header.querySelector('.header-toggle');
  const headerNav = header.querySelector('.header-nav');
  const compactHeader = window.matchMedia('(max-width: 72rem)');

  function closeHeaderMenu() {
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  menuToggle.hidden = false;
  menuToggle.addEventListener(
    'click',
    () => {
      const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!expanded));
    },
    { signal },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeHeaderMenu();
        menuToggle.focus();
      }
    },
    { signal },
  );

  document.addEventListener(
    'click',
    (event) => {
      if (
        !event.target.closest('.site-header') ||
        (headerNav.contains(event.target) && event.target.closest('a'))
      ) {
        closeHeaderMenu();
      }
    },
    { signal },
  );
  compactHeader.addEventListener('change', closeHeaderMenu, { signal });
}

export function bindWave(brand, signal) {
  const fish = brand.querySelector('img');
  const wordmark = brand.querySelector('.brand-name');
  const name = wordmark.textContent;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  brand.setAttribute('aria-label', name);
  wordmark.setAttribute('aria-hidden', 'true');
  const letters = Array.from(name, (char) => {
    const letter = document.createElement('span');
    letter.textContent = char;
    return letter;
  });
  wordmark.replaceChildren(...letters);

  function stopWave() {
    brand.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  }

  function playWave() {
    if (reducedMotion.matches) return;
    stopWave();
    fish.animate(
      [
        { transform: 'none' },
        { transform: 'translateY(.09em) rotate(-8deg)', offset: 0.2 },
        { transform: 'translate(.12em, -.16em) rotate(7deg)', offset: 0.55 },
        { transform: 'none' },
      ],
      { duration: 560, easing: 'ease-in-out' },
    );
    letters.forEach((letter, index) => {
      letter.animate(
        [
          { transform: 'none' },
          { transform: 'translateY(-.18em) rotate(-3deg)', color: 'var(--accent)' },
          { transform: 'none' },
        ],
        { duration: 270, delay: 105 + index * 32, easing: 'ease-in-out' },
      );
    });
  }

  brand.addEventListener(
    'pointerenter',
    (event) => {
      if (event.pointerType !== 'touch') playWave();
    },
    { signal },
  );
  brand.addEventListener(
    'focus',
    () => {
      if (brand.matches(':focus-visible')) playWave();
    },
    { signal },
  );
  reducedMotion.addEventListener('change', stopWave, { signal });
}
