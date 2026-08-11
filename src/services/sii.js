const COMUNAS = {
  'nunoa': '15105', 'providencia': '15123', 'las condes': '15114',
  'penalolen': '15121', 'santiago': '15101', 'vitacura': '15132',
  'la reina': '15113', 'macul': '15118', 'san miguel': '15126',
  'la florida': '15110', 'maipu': '15119', 'huechuraba': '15108',
  'independencia': '15109', 'recoleta': '15125', 'lo barnechea': '15116',
  'estacion central': '15106',
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
    codigoComuna: COMUNAS[normalizar(comunaRaw)] || '15105'
  };
}

export async function buscarEnSII(calle, numero, comuna) {
  try {
    const params = new URLSearchParams({ calle, numero: numero || '', comuna });
    const res = await fetch(`/api/buscar-rol?${params}`);
    const data = await res.json();
    if (data.error && !data.rol) return null;
    return data;
  } catch(e) {
    console.error('Error SII:', e);
    return null;
  }
}

export async function buscarArriendos(comuna, destino) {
  try {
    const tipo = destino && destino.toLowerCase().includes('departamento') ? 'departamento' : 'casa';
    const res = await fetch(`/api/arriendos?comuna=${encodeURIComponent(comuna)}&tipo=${tipo}`);
    const data = await res.json();
    if (data.error || !data.promedio) return null;
    return data;
  } catch(e) {
    return null;
  }
}
