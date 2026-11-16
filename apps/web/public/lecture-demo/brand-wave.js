/* global document */
void import('./header-behavior.mjs').then(({ bindWave }) => {
  const element = document.querySelector('.site-header .brand');
  if (element) bindWave(element);
});
