/* global document */
void import('./header-behavior.mjs').then(({ bindMenu }) => {
  const element = document.querySelector('.site-header');
  if (element) bindMenu(element);
});
