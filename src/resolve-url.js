import URLToolkit from 'url-toolkit';
import window from 'global/window';

const resolveUrl = (baseUrl, relativeUrl) => {
  // return early if we don't need to resolve
  if ((/^[a-z]+:/i).test(relativeUrl)) {
    return relativeUrl;
  }

  // IE11 supports URL but not the URL constructor
  // feature detect the behavior we want
  const nativeURL = typeof window.URL === 'function';

  const protocolLess = !(/^https?:/.test(baseUrl));

  // if the base URL is relative then combine with the current location
  if (nativeURL) {
    baseUrl = new window.URL(baseUrl, window.location);
  } else if (!(/\/\//i).test(baseUrl)) {
    baseUrl = URLToolkit.buildAbsoluteURL(window.location && window.location.href || '', baseUrl);
  }

  if (nativeURL) {
    const newUrl = new URL(relativeUrl, baseUrl);

    // if we're a protocol-less url, return a protocol-less url
    if (protocolLess) {
      return newUrl.href.slice(newUrl.protocol.length);
    }

    return newUrl;
  }
  return URLToolkit.buildAbsoluteURL(baseUrl, relativeUrl);

};

export default resolveUrl;
