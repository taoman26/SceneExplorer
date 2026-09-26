import os from 'node:os';

// URLs a browser on the LAN can use to reach the server.
export function listenUrls(host, port, interfaces = os.networkInterfaces()) {
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host}:${port}`];
  const urls = [`http://localhost:${port}`];
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${port}`);
    }
  }
  return urls;
}
