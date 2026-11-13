/* global document, getComputedStyle, window */
const frame = document.querySelector('.demo-frame');
frame.addEventListener('load', () => {
  const widget = frame.contentDocument.querySelector('.demo');
  if (!widget) return;

  function syncTypeSize() {
    frame.contentDocument.documentElement.style.fontSize = getComputedStyle(
      document.documentElement,
    ).fontSize;
  }
  syncTypeSize();
  window.addEventListener('resize', syncTypeSize);
});

const practiceFrame = document.querySelector('.practice-frame');
practiceFrame.addEventListener('load', () => {
  const practice = practiceFrame.contentDocument.querySelector('.practice');
  if (!practice) return;
  function syncPracticeType() {
    practice.ownerDocument.documentElement.style.fontSize = getComputedStyle(
      document.documentElement,
    ).fontSize;
  }
  syncPracticeType();
  window.addEventListener('resize', syncPracticeType);
  new window.ResizeObserver(() => {
    practiceFrame.style.height = Math.ceil(practice.getBoundingClientRect().height) + 'px';
  }).observe(practice);
});
