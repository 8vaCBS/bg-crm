import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, getDocs,
  updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyA_cRP05Wj1ePP64zd5dQur_aSarmfA-_A",
  authDomain: "bg-inmobiliaria-6072d.firebaseapp.com",
  projectId: "bg-inmobiliaria-6072d",
  storageBucket: "bg-inmobiliaria-6072d.firebasestorage.app",
  messagingSenderId: "914685474611",
  appId: "1:914685474611:web:38900a6a60de13128cf046"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export const auth = getAuth(app);

// Correos autorizados
const CORREOS_AUTORIZADOS = [
  'barbaragutierrez9383@gmail.com',
  'barbaragc@bgadministradora.cl',
  'andres.lruiz@gmail.com',
];

export function esCorreoAutorizado(email) {
  return CORREOS_AUTORIZADOS.includes(email?.toLowerCase());
}

// Auth functions
export async function loginConGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function onUsuarioCambia(callback) {
  return onAuthStateChanged(auth, callback);
}

// Firestore functions
export async function getPropiedades() {
  const q = query(collection(db, 'propiedades'), orderBy('creadoEn', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addPropiedad(data) {
  const ref = await addDoc(collection(db, 'propiedades'), {
    ...data, status: 'nuevo', creadoEn: serverTimestamp()
  });
  return ref.id;
}

export async function updatePropiedad(id, data) {
  await updateDoc(doc(db, 'propiedades', id), {
    ...data, actualizadoEn: serverTimestamp()
  });
}

export async function deletePropiedad(id) {
  await deleteDoc(doc(db, 'propiedades', id));
}
