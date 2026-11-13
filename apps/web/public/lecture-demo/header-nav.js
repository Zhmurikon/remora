/* global document, window */
'use strict';

const menuToggle = document.querySelector('.header-toggle');
const headerNav = document.querySelector('#header-nav');
const compactHeader = window.matchMedia('(max-width: 72rem)');

function closeHeaderMenu() {
  menuToggle.setAttribute('aria-expanded', 'false');
}

menuToggle.hidden = false;
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    closeHeaderMenu();
    menuToggle.focus();
  }
});

document.addEventListener('click', (event) => {
  if (
    !event.target.closest('.site-header') ||
    (headerNav.contains(event.target) && event.target.closest('a'))
  ) {
    closeHeaderMenu();
  }
});
compactHeader.addEventListener('change', closeHeaderMenu);
