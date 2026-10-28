/** إعداد Firebase + غلاف عمليات المراقبة */
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,updatePassword,setPersistence,browserLocalPersistence} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,getDoc as _fbGetDoc,setDoc as _fbSetDoc,addDoc as _fbAddDoc,updateDoc as _fbUpdateDoc,deleteDoc as _fbDeleteDoc,deleteField,collection,onSnapshot,query,where,orderBy,limit,getDocs as _fbGetDocs,writeBatch,serverTimestamp,arrayUnion,arrayRemove,FieldPath,startAfter,documentId} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const __EC = window.__EC || {ops:[],log:[],buf:[],net:[],report(){},page(){return""}};

function __opPath(a){
  try{
    const r=a&&a[0];
    if(!r)return"";
    if(typeof r.path==="string")return r.path;
    if(r._query&&r._query.path&&r._query.path.canonicalString)return r._query.path.canonicalString();
    if(r._path&&r._path.canonicalString)return r._path.canonicalString();
  }catch(_){}
  return"";
}

function __wrapOp(name,fn){
  return function(...a){
    const t0=performance.now(),rec={t:Date.now(),op:name,path:__opPath(a),ms:0,ok:true};
    const done=(ok,e)=>{
      rec.ms=Math.round(performance.now()-t0);
      rec.ok=ok;
      if(!ok){
        rec.err=String(e&&(e.code||e.message)||e).slice(0,80);
        try{__EC.report("firebase",e,{fn:name+" "+rec.path})}catch(_){}
      }
      __EC.ops.push(rec);
      if(__EC.ops.length>100)__EC.ops.shift();
    };
    let p;
    try{p=fn.apply(this,a)}catch(e){done(false,e);throw e}
    if(p&&typeof p.then==="function")return p.then(r=>{done(true);return r},e=>{done(false,e);throw e});
    done(true);
    return p;
  };
}

export const getDoc = __wrapOp("getDoc",_fbGetDoc);
export const setDoc = __wrapOp("setDoc",_fbSetDoc);
export const addDoc = __wrapOp("addDoc",_fbAddDoc);
export const updateDoc = __wrapOp("updateDoc",_fbUpdateDoc);
export const deleteDoc = __wrapOp("deleteDoc",_fbDeleteDoc);
export const getDocs = __wrapOp("getDocs",_fbGetDocs);

export const firebaseConfig = {
  apiKey: "AIzaSyCo99zGbGOJSw1p-rdy3bk9PSxzsINWkxQ",
  authDomain: "eltafawoq-8b700.firebaseapp.com",
  projectId: "eltafawoq-8b700",
  messagingSenderId: "892405720236",
  appId: "1:892405720236:web:734c19429b8ee8e292eb09"
};

export {
  initializeApp,
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updatePassword, setPersistence, browserLocalPersistence,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, deleteField, collection, onSnapshot, query, where, orderBy, limit,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, FieldPath, startAfter, documentId
};
