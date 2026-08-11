const COMUNAS = {
  'nunoa': '13120', 'nunoa': '13120',
  'providencia': '13123',
  'las condes': '13114',
  'penalolen': '13121',
  'santiago': '13101',
  'vitacura': '13132',
  'la reina': '13113',
  'macul': '13118',
  'san miguel': '13126',
  'la florida': '13110',
  'maipu': '13119',
};

function normalizar(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function parsearDireccion(texto) {
  const partes = texto.split(/,/).map(p => p.trim());
  const comunaRaw = partes.length > 1 ? partes[partes.length - 1] : 'Nunoa';
  const calleCompleta = partes[0] || texto;
  const m = calleCompleta.match(/^(.+?)\s+(\d+\w*)$/);
  return {
    calle: m ? m[1].trim() : calleCompleta,
    numero: m ? m[2] : '',
    comuna: comunaRaw,
    codigoComuna: COMUNAS[normalizar(comunaRaw)] || '13120'
  };
}

export async function buscarEnSII(calle, numero, codigoComuna) {
  try {
    const siiUrl = 'https://zeus.sii.cl/avalu_cgi/br/brc200.sh?CODIGO_COMUNA=' + codigoComuna + '&NOMBRE_CALLE=' + encodeURIComponent(calle.toUpperCase()) + '&NUMERO_CALLE=' + numero + '&TIPO_BIEN_RAIZ=TODOS&BOTON=Buscar';
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(siiUrl);
    const res = await fetch(proxy);
    const data = await res.json();
    if (!data.contents) return null;
    const html = data.contents;
    const rolMatches = [...html.matchAll(/(\d{3,7})-(\d{1,4})/g)];
    const roles = rolMatches.map(m => m[0]).filter(r => parseInt(r.split('-')[0]) > 100);
    const avaluoMatch = html.match(/\$\s*([\d\.]+)/);
    const avaluo = avaluoMatch ? parseInt(avaluoMatch[1].replace(/\./g, '')) : null;
    return { rol: roles[0] || null, avaluoFiscal: avaluo };
  } catch(e) { return null; }
}

export async function buscarArriendos(comuna) {
  try {
    const slug = normalizar(comuna).replace(/\s+/g, '-');
    const url = 'https://www.portalinmobiliario.com/arriendo/casas/' + slug;
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    const res = await fetch(proxy);
    const data = await res.json();
    if (!data.contents) return null;
    const precios = [];
    const re = /UF\s*([\d.,]+)/g;
    let m;
    while ((m = re.exec(data.contents)) !== null) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (v > 5 && v < 200) precios.push(v);
    }
    if (!precios.length) return null;
    const prom = precios.reduce((a,b) => a+b, 0) / precios.length;
    return { promedio: Math.round(prom*10)/10, min: Math.round(Math.min(...precios)*10)/10, max: Math.round(Math.max(...precios)*10)/10, muestras: precios.length };
  } catch(e) { return null; }
}
