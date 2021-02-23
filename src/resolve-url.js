import URLToolkit from 'url-toolkit';
import window from 'global/window';

const resolveUrl = (baseUrl, relativeUrl) => {
  // return early if we don't need to resolve
  if ((/^[a-z]+:/i).test(relativeUrl)) {
    return relativeUrl;
  }

  // if the base URL is relative then combine with the current location
  if (window.URL) {
    baseUrl = new window.URL(baseUrl, window.location);
  } else if (!(/\/\//i).test(baseUrl)) {
    baseUrl = URLToolkit.buildAbsoluteURL(window.location && window.location.href || '', baseUrl);
  }

  if (window.URL) {
    return new URL(relativeUrl, baseUrl).href;
  }
  return URLToolkit.buildAbsoluteURL(baseUrl, relativeUrl);

};

export default resolveUrl;
