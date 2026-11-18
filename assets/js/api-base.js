(() => {
  const previewOrigin = 'http://127.0.0.1:8788';
  const apiOrigin = location.origin === previewOrigin
    ? 'https://mzactive-marketplace-api-preview.mzactive5.workers.dev'
    : 'https://mzactive-marketplace-api.mzactive5.workers.dev';

  window.MZACTIVE_API_BASE = apiOrigin;
})();
