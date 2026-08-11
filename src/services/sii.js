const COMUNAS = {
  'nunoa': '13120', 'providencia': '13123', 'las condes': '13114',
  'penalolen': '13121', 'santiago': '13101', 'vitacura': '13132',
  'la reina': '13113', 'macul': '13118', 'san miguel': '13126',
  'la florida': '13110', 'maipu': '13119', 'huechuraba': '13108',
  'independencia': '13109', 'recoleta': '13125', 'lo barnechea': '13116',
  'estacion central': '13106',
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

export async function buscarEnSII(calle, numero, comuna) {
  try {
    const params = new URLSearchParams({ calle, numero: numero || '', comuna });
    const res = await fetch(`/api/buscar-rol?${params}`);
    const data = await res.json();
    if (data.error && !data.rol) return null;
    return {
      rol: data.rol || null,
      avaluoFiscal: data.avaluoFiscal || null,
      direccionSII: data.direccionSII || null,
    };
  } catch(e) {
    console.error('Error SII:', e);
    return null;
  }
}

export async function buscarArriendos(comuna) {
  try {
    const res = await fetch(`/api/arriendos?comuna=${encodeURIComponent(comuna)}`);
    const data = await res.json();
    if (data.error || !data.promedio) return null;
    return data;
  } catch(e) {
    return null;
  }
}
