/* global document, window */
'use strict';

const brand = document.querySelector('header .brand');
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

brand.addEventListener('pointerenter', (event) => {
  if (event.pointerType !== 'touch') playWave();
});
brand.addEventListener('focus', () => {
  if (brand.matches(':focus-visible')) playWave();
});
reducedMotion.addEventListener('change', stopWave);
