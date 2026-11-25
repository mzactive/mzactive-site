/* Centralized sign-in destination. The Worker is the only source of account
 * type and destination; this helper never infers a role from a form control. */
(() => {
  const KEY = 'mzactive-provider-session';
  const DESTINATIONS = new Set(['/admin.html', '/providers.html', '/dashboard.html', '/pacer-dashboard.html']);

  const destination = (data) => {
    const path = data?.dashboard_path;
    if (DESTINATIONS.has(path)) return path;
    if (data?.management?.enabled || data?.user?.role === 'admin') return '/admin.html';
    if (data?.account_type === 'pacer') return '/pacer-dashboard.html';
    if (data?.account_type === 'provider' || data?.user?.role === 'provider') return '/providers.html';
    return '/dashboard.html';
  };

  const store = (data) => {
    const path = destination(data);
    if (path === '/admin.html') {
      sessionStorage.setItem(KEY, data.token);
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, data.token);
      sessionStorage.removeItem(KEY);
    }
    return path;
  };

  const token = () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '';

  const isWorkoutId = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  window.MZActiveAuth = Object.freeze({ KEY, destination, store, token, isWorkoutId });
})();
