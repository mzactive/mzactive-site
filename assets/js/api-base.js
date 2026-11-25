(() => {
  const previewOrigin = 'http://127.0.0.1:8788';
  const testHost = 'mzactive-conversion-staging.mzactive5.workers.dev';
  const conversionStaging = location.hostname === testHost;
  const apiOrigin = conversionStaging ? location.origin : location.origin === previewOrigin
    ? 'https://mzactive-marketplace-api-preview.mzactive5.workers.dev'
    : 'https://mzactive-marketplace-api.mzactive5.workers.dev';

  window.MZA_CONVERSION_STAGING = conversionStaging;
  window.MZACTIVE_API_BASE = apiOrigin;
})();
