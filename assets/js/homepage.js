(() => {
  const menuButton = document.getElementById('menuToggle');
  const navigation = document.getElementById('mainNavigation');
  if (!menuButton || !navigation) return;

  const setOpen = open => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', document.documentElement.lang === 'ar' ? 'قائمة التنقل' : 'Navigation menu');
    navigation.classList.toggle('is-open', open);
  };

  menuButton.addEventListener('click', () => {
    setOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setOpen(false);
  });
  document.addEventListener('mzactive:language-change', () => {
    setOpen(menuButton.getAttribute('aria-expanded') === 'true');
  });
})();
