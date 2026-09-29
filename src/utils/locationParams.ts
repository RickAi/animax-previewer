const readParamFromSearch = (search: string, name: string) => {
  if (!search) return null;
  return new URLSearchParams(search).get(name);
};

const getHashSearch = () => {
  if (typeof window === 'undefined') return '';
  const questionIndex = window.location.hash.indexOf('?');
  return questionIndex >= 0 ? window.location.hash.slice(questionIndex) : '';
};

export const getLocationParam = (name: string, routeSearch = '') => {
  return (
    readParamFromSearch(routeSearch, name) ??
    readParamFromSearch(getHashSearch(), name) ??
    readParamFromSearch(typeof window === 'undefined' ? '' : window.location.search, name)
  );
};
