const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function devicePublicIdFromHash(hash: string): string {
  if (!hash.startsWith("#")) return "";
  const value = new URLSearchParams(hash.slice(1)).get("bbDevice");
  return value && deviceIdPattern.test(value) ? value.toLowerCase() : "";
}

export function urlWithoutDeviceFragment(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}
