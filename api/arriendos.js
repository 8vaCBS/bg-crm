
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const POLIGONOS = {
    'nunoa': 33, 'providencia': 32, 'las condes': 20,
    'penalolen': 15, 'santiago': 1, 'vitacura': 21,
    'la reina': 19, 'macul': 31, 'la florida': 16,
    'maipu': 22, 'lo barnechea': 18, 'huechuraba': 13,
    'independencia': 14, 'recoleta': 36, 'estacion central': 10,
    'san miguel': 38, 'cerrillos': 6, 'pudahuel': 35,
  };

  const comunaNorm = normalizar(comuna);
  const idPoligono = POLIGONOS[comunaNorm] || 33;
  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

  async function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: hdrs || {} }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({
          status: r.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          cookies: r.headers['set-cookie'] || [],
        }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  async function fetchPost(hostname, path, payload, hdrs) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...hdrs }
      }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  try {
    const refererUrl = `https://www.toctoc.com/resultados/mapa/arriendo/${tipoProp}/?idPoligono=${idPoligono}&texto=${comunaNorm}`;

    // Paso 1: Obtener sesión y extraer X-Access-Token del HTML
    const sessionRes = await fetchGet(refererUrl, {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'es-419,es;q=0.9',
      'Accept-Encoding': 'identity',
    });

    const cookies = sessionRes.cookies.map(c => c.split(';')[0]).join('; ');

    // Extraer X-Access-Token del HTML (está en el JS embebido)
    let accessToken = '';
    const tokenMatch = sessionRes.body.match(/["']?[Xx]-?[Aa]ccess-?[Tt]oken["']?\s*[:=]\s*["']([A-Za-z0-9._-]{20,})["']/);
    if (tokenMatch) accessToken = tokenMatch[1];

    // También buscar el token en formato JWT
    if (!accessToken) {
      const jwtMatch = sessionRes.body.match(/eyJ[A-Za-z0-9._-]{50,}/);
      if (jwtMatch) accessToken = jwtMatch[0];
    }

    // Paso 2: Obtener token desde endpoint dedicado si existe
    if (!accessToken) {
      try {
        const tokenRes = await fetchGet('https://www.toctoc.com/api/token', {
          'User-Agent': UA, 'Cookie': cookies,
          'Accept': 'application/json',
          'Referer': refererUrl,
        });
        if (tokenRes.status === 200) {
          const td = JSON.parse(tokenRes.body);
          accessToken = td.token || td.access_token || td.Token || '';
        }
      } catch(e) {}
    }

    if (debug === '1') {
      return res.status(200).json({
        sessionStatus: sessionRes.status,
        cookiesLen: cookies.length,
        accessToken: accessToken ? accessToken.substring(0, 50) + '...' : 'NOT FOUND',
        htmlLen: sessionRes.body.length,
      });
    }

    const payload = {
      region: '', comuna: '', barrio: '', poi: '',
      tipoVista: 'mapa', operacion: 2,
      idPoligono, moneda: 2,
      precioDesde: 0, precioHasta: 0,
      dormitoriosDesde: 0, dormitoriosHasta: 0,
      banosDesde: 0, banosHasta: 0,
      tipoPropiedad: tipoProp,
      estado: 0, disponibilidadEntrega: '',
      numeroDeDiasTocToc: 0,
      superficieDesdeUtil: 0, superficieHastaUtil: 0,
      superficieDesdeConstruida: 0, superficieHastaConstruida: 0,
      superficieDesdeTerraza: 0, superficieHastaTerraza: 0,
      superficieDesdeTerreno: 0, superficieHastaTerreno: 0,
      ordenarPor: 0, pagina: 1, paginaInterna: 1,
      zoom: 15, idZonaHomogenea: 0,
      busqueda: comunaNorm, viewport: '',
      atributos: [], publicador: 0, temporalidad: 0,
      limite: 100, cargaBanner: false,
      primeraCarga: true, santander: false
    };

    const reqHdrs = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-419,es;q=0.9',
      'Cache-Control': 'no-cache',
      'Cookie': cookies,
      'Origin': 'https://www.toctoc.com',
      'Referer': refererUrl,
      'User-Agent': UA,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    if (accessToken) reqHdrs['X-Access-Token'] = accessToken;

    const r = await fetchPost('www.toctoc.com', '/api/mapa/GetProps', payload, reqHdrs);

    if (r.status !== 200 || !r.body) {
      return res.status(200).json({ error: `TocToc status ${r.status}`, hasToken: !!accessToken });
    }

    const data = JSON.parse(r.body);
    const props = data.propiedades || data.Propiedades || data.items || data.results || [];

    if (!props.length) {
      return res.status(200).json({ error: 'Sin propiedades', keys: Object.keys(data).slice(0, 10) });
    }

    const precios = props
      .map(p => p.precio || p.Precio || 0)
      .filter(v => v >= 5 && v <= 500);

    if (precios.length < 3) {
      return res.status(200).json({
        error: 'Pocos precios UF',
        sample: props.slice(0, 2).map(p => ({ precio: p.precio, moneda: p.moneda })),
      });
    }

    precios.sort((a, b) => a - b);
    const cut = Math.floor(precios.length * 0.1);
    const filtrados = precios.slice(cut, precios.length - (cut || 1));
    const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;

    return res.status(200).json({
      promedio: Math.round(prom * 10) / 10,
      min: Math.round(filtrados[0] * 10) / 10,
      max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
      muestras: filtrados.length,
      fuente: 'TocToc',
      tipo: tipoProp,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
